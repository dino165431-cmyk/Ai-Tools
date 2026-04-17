import argparse
import json
import sys
import time
import threading
import traceback
from queue import Empty, Queue

IMPORT_ERROR = None

try:
    from jupyter_client import KernelManager
except Exception as exc:
    KernelManager = None
    IMPORT_ERROR = exc


def send_json(payload):
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def normalize_stream_text(raw):
    if isinstance(raw, list):
        raw = "".join(str(item) for item in raw)
    return str(raw or "").replace("\r\n", "\n").replace("\r", "\n")


def normalize_timeout_ms(value, minimum_ms=3000):
    if value is None:
        return None

    try:
        rounded = int(value)
    except (TypeError, ValueError):
        return None

    if rounded <= 0:
        return None

    return max(minimum_ms, rounded)


class NotebookKernelSession:
    def __init__(self, kernel_name="", cwd="", startup_timeout_ms=0):
        self.kernel_name = str(kernel_name or "").strip()
        self.cwd = cwd or None
        self.startup_timeout_ms = normalize_timeout_ms(startup_timeout_ms)
        self.km = None
        self.client = None

    def start(self):
        kwargs = {}
        if self.kernel_name:
            kwargs["kernel_name"] = self.kernel_name
        self.km = KernelManager(**kwargs)
        self.km.start_kernel(cwd=self.cwd)
        self.client = self.km.blocking_client()
        self.client.start_channels()
        timeout_seconds = None if self.startup_timeout_ms is None else self.startup_timeout_ms / 1000.0
        self.client.wait_for_ready(timeout=timeout_seconds)

    def shutdown(self):
        try:
            if self.client:
                self.client.stop_channels()
        finally:
            self.client = None
            if self.km:
                try:
                    self.km.shutdown_kernel(now=True)
                finally:
                    self.km = None

    def restart(self, startup_timeout_ms=None):
        timeout_ms = normalize_timeout_ms(startup_timeout_ms)
        if timeout_ms is None:
            timeout_ms = self.startup_timeout_ms
        self.shutdown()
        self.startup_timeout_ms = timeout_ms
        self.start()
        return {
            "kernel_name": self.km.kernel_name if self.km else (self.kernel_name or "")
        }

    def interrupt(self):
        if not self.km:
            raise RuntimeError("Kernel is not running")
        self.km.interrupt_kernel()
        return {"interrupted": True}

    def _collect_shell_reply(self, msg_id, deadline=None):
        if not self.client:
            raise RuntimeError("Kernel client is not available")

        while True:
            if deadline is None:
                msg = self.client.get_shell_msg()
            else:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise TimeoutError("Timed out while waiting for execute reply")
                msg = self.client.get_shell_msg(timeout=max(0.1, remaining))
            parent_id = str(msg.get("parent_header", {}).get("msg_id") or "")
            if parent_id != msg_id:
                continue
            return msg

    def execute(self, code, timeout_ms, progress_callback=None, input_callback=None, control_callback=None):
        if not self.client:
            raise RuntimeError("Kernel client is not available")

        msg_id = self.client.execute(str(code or ""), store_history=True, allow_stdin=True, stop_on_error=False)
        outputs = []
        execution_count = None
        deadline = None
        normalized_timeout_ms = normalize_timeout_ms(timeout_ms)
        if normalized_timeout_ms is not None:
            deadline = time.monotonic() + normalized_timeout_ms / 1000.0

        def ensure_not_timed_out():
            if deadline is not None and time.monotonic() >= deadline:
                raise TimeoutError(f"Notebook Cell execution timed out ({normalized_timeout_ms}ms)")

        def publish_progress(status="running", extra=None):
            if not progress_callback:
                return
            payload = {
                "execution_count": execution_count,
                "outputs": outputs,
                "status": status
            }
            if isinstance(extra, dict):
                payload.update(extra)
            progress_callback(payload)

        def read_iopub_message(timeout_seconds):
            if deadline is None:
                return self.client.get_iopub_msg(timeout=timeout_seconds)

            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError(f"Notebook Cell execution timed out ({normalized_timeout_ms}ms)")

            bounded_timeout = max(0.01, min(timeout_seconds, remaining))
            return self.client.get_iopub_msg(timeout=bounded_timeout)

        def handle_iopub_message(message):
            nonlocal outputs, execution_count

            parent_id = str(message.get("parent_header", {}).get("msg_id") or "")
            if parent_id != msg_id:
                return False

            msg_type = str(message.get("msg_type") or "")
            content = message.get("content") or {}

            if msg_type == "status" and content.get("execution_state") == "idle":
                return True

            if msg_type == "execute_input":
                execution_count = content.get("execution_count")
                publish_progress()
                return False

            if msg_type == "stream":
                text = normalize_stream_text(content.get("text"))
                name = str(content.get("name") or "stdout")
                # Preserve each stream chunk as its own entry so repeated
                # stdin interactions can stay interleaved with subsequent
                # stdout/stderr output in display order.
                outputs.append({
                    "output_type": "stream",
                    "name": name,
                    "text": text
                })
                publish_progress()
                return False

            if msg_type in ("display_data", "execute_result"):
                if msg_type == "execute_result" and content.get("execution_count") is not None:
                    execution_count = content.get("execution_count")
                outputs.append({
                    "output_type": msg_type,
                    "data": content.get("data") or {},
                    "metadata": content.get("metadata") or {},
                    "execution_count": content.get("execution_count")
                })
                publish_progress()
                return False

            if msg_type == "error":
                outputs.append({
                    "output_type": "error",
                    "ename": str(content.get("ename") or ""),
                    "evalue": str(content.get("evalue") or ""),
                    "traceback": [str(item) for item in (content.get("traceback") or [])]
                })
                publish_progress()
                return False

            if msg_type == "clear_output":
                outputs = []
                publish_progress()
                return False

            return False

        try:
            while True:
                ensure_not_timed_out()

                if control_callback:
                    control_callback()

                execution_finished = False
                while True:
                    try:
                        message = read_iopub_message(0.01)
                    except Empty:
                        break

                    if handle_iopub_message(message):
                        execution_finished = True
                        break

                if execution_finished:
                    break

                try:
                    stdin_message = self.client.get_stdin_msg(timeout=0.05)
                except Empty:
                    stdin_message = None

                if stdin_message is not None:
                    parent_id = str(stdin_message.get("parent_header", {}).get("msg_id") or "")
                    if parent_id == msg_id and str(stdin_message.get("msg_type") or "") == "input_request":
                        content = stdin_message.get("content") or {}
                        response = ""
                        if input_callback:
                            response = input_callback({
                                "prompt": str(content.get("prompt") or ""),
                                "password": bool(content.get("password")),
                                "execution_count": execution_count,
                                "outputs": outputs
                            })
                        if response is not None:
                            self.client.input(str(response))
                            publish_progress()
                        continue

                try:
                    message = read_iopub_message(0.1)
                except Empty:
                    continue

                if handle_iopub_message(message):
                    break

            shell_reply = self._collect_shell_reply(msg_id, deadline)
            shell_content = shell_reply.get("content") or {}
            if shell_content.get("execution_count") is not None:
                execution_count = shell_content.get("execution_count")

            return {
                "execution_count": execution_count,
                "outputs": outputs,
                "status": str(shell_content.get("status") or "ok")
            }
        except TimeoutError:
            try:
                self.interrupt()
            except Exception:
                pass
            raise


def start_command_reader(command_queue):
    def reader():
        for line in sys.stdin:
            raw = str(line or "").strip()
            if not raw:
                continue
            try:
                command_queue.put(json.loads(raw))
            except Exception as exc:
                command_queue.put({
                    "request_id": "",
                    "command": "__invalid__",
                    "payload": {
                        "raw": raw,
                        "error": f"{type(exc).__name__}: {exc}"
                    }
                })
        command_queue.put(None)

    thread = threading.Thread(target=reader, daemon=True)
    thread.start()
    return thread


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--kernel-name", default="")
    parser.add_argument("--cwd", default="")
    parser.add_argument("--startup-timeout-ms", default="0")
    args = parser.parse_args()

    if IMPORT_ERROR is not None:
        send_json({
            "event": "startup_error",
            "ok": False,
            "error_code": "MISSING_JUPYTER_CLIENT",
            "python_path": sys.executable,
            "error": f"{type(IMPORT_ERROR).__name__}: {IMPORT_ERROR}",
            "install_command": f"\"{sys.executable}\" -m pip install jupyter_client ipykernel"
        })
        sys.exit(1)

    session = NotebookKernelSession(
        kernel_name=args.kernel_name,
        cwd=args.cwd,
        startup_timeout_ms=args.startup_timeout_ms
    )

    try:
        session.start()
        send_json({
            "event": "ready",
            "kernel_name": session.km.kernel_name if session.km else (args.kernel_name or "")
        })
    except Exception as exc:
        error_code = "KERNEL_STARTUP_TIMEOUT" if isinstance(exc, TimeoutError) else "KERNEL_STARTUP_FAILED"
        send_json({
            "event": "startup_error",
            "ok": False,
            "error_code": error_code,
            "python_path": sys.executable,
            "startup_timeout_ms": session.startup_timeout_ms or 0,
            "error": f"{type(exc).__name__}: {exc}"
        })
        sys.exit(1)

    command_queue = Queue()
    deferred_commands = []
    start_command_reader(command_queue)

    def take_command(block=True, timeout=None):
        if deferred_commands:
            return deferred_commands.pop(0)
        if block:
            if timeout is None:
                return command_queue.get()
            return command_queue.get(timeout=timeout)
        return command_queue.get_nowait()

    def defer_command(message):
        if message is None:
            return
        deferred_commands.append(message)

    def reply_ok(request_id, result):
        send_json({
            "request_id": request_id,
            "ok": True,
            "result": result
        })

    def reply_error(request_id, error_text):
        send_json({
            "request_id": request_id,
            "ok": False,
            "error": str(error_text or "Notebook 执行失败")
        })

    def handle_runtime_control(message, waiting_input_request_id=""):
        if message is None:
            return {"state": "closed"}

        request_id = str(message.get("request_id") or "")
        command = str(message.get("command") or "").strip()
        payload = message.get("payload") or {}

        if command == "__invalid__":
            if request_id:
                reply_error(request_id, f"无法解析 Notebook Runtime 命令：{payload.get('error') or 'invalid json'}")
            return {"state": "handled"}

        if command == "interrupt":
            try:
                reply_ok(request_id, session.interrupt())
            except Exception as exc:
                reply_error(request_id, f"{type(exc).__name__}: {exc}")
            return {"state": "interrupted"}

        if command == "input_reply":
            input_request_id = str(payload.get("input_request_id") or "")
            if waiting_input_request_id and input_request_id == waiting_input_request_id:
                reply_ok(request_id, {
                    "accepted": True,
                    "input_request_id": waiting_input_request_id
                })
                return {
                    "state": "input",
                    "value": str(payload.get("value") or "")
                }
            if request_id:
                reply_error(request_id, "???????????")
            return {"state": "handled"}

        defer_command(message)
        return {"state": "deferred"}

    def poll_execute_control():
        while True:
            try:
                message = take_command(block=False)
            except Empty:
                return
            result = handle_runtime_control(message)
            if result.get("state") in ("deferred", "closed"):
                return

    def wait_for_input_reply(execute_request_id, request):
        input_request_id = f"input_{time.time_ns()}"
        send_json({
            "event": "progress",
            "request_id": execute_request_id,
            "result": {
                "execution_count": request.get("execution_count"),
                "outputs": request.get("outputs") or [],
                "status": "input_requested",
                "input_request_id": input_request_id,
                "prompt": str(request.get("prompt") or ""),
                "password": bool(request.get("password"))
            }
        })

        while True:
            try:
                message = take_command(block=True, timeout=0.1)
            except Empty:
                continue
            result = handle_runtime_control(message, waiting_input_request_id=input_request_id)
            state = result.get("state")
            if state == "input":
                return result.get("value", "")
            if state in ("interrupted", "closed"):
                return None

    while True:
        try:
            message = take_command(block=True)
        except Empty:
            continue

        if message is None:
            return

        request_id = ""
        try:
            request_id = str(message.get("request_id") or "")
            command = str(message.get("command") or "").strip()
            payload = message.get("payload") or {}

            if command == "__invalid__":
                if request_id:
                    reply_error(request_id, f"无法解析 Notebook Runtime 命令：{payload.get('error') or 'invalid json'}")
                continue

            if command == "execute":
                def emit_progress(result):
                    send_json({
                        "event": "progress",
                        "request_id": request_id,
                        "result": result
                    })

                result = session.execute(
                    code=payload.get("code"),
                    timeout_ms=payload.get("timeout_ms", None),
                    progress_callback=emit_progress,
                    input_callback=lambda req: wait_for_input_reply(request_id, req),
                    control_callback=poll_execute_control
                )
                reply_ok(request_id, result)
                continue

            if command == "input_reply":
                reply_error(request_id, "当前没有正在等待的输入请求")
                continue

            if command == "interrupt":
                reply_ok(request_id, session.interrupt())
                continue

            if command == "restart":
                reply_ok(request_id, session.restart(payload.get("startup_timeout_ms")))
                continue

            if command == "shutdown":
                session.shutdown()
                reply_ok(request_id, {"shutdown": True})
                return

            raise RuntimeError(f"Unsupported command: {command}")
        except Exception as exc:
            error_code = "EXECUTION_TIMEOUT" if isinstance(exc, TimeoutError) else ""
            send_json({
                "request_id": request_id,
                "ok": False,
                "error_code": error_code,
                "timeout_ms": normalize_timeout_ms(payload.get("timeout_ms"), minimum_ms=1) or 0 if 'payload' in locals() else 0,
                "error": f"{type(exc).__name__}: {exc}",
                "traceback": traceback.format_exc()
            })


if __name__ == "__main__":
    main()
