import { ref } from 'vue';

const utoolsEnterEventData = ref({
    code: '',
    type: '',
    payload: '',
    from: '',
    option: ''
})

function initUtoolsListener() {
    try {
        window?.utools?.onPluginEnter?.((data) => {
            const safe = data && typeof data === 'object' ? data : {};
            const {
                code = '',
                type = '',
                payload = '',
                from = '',
                option = ''
            } = safe;
            utoolsEnterEventData.value = { code, type, payload, from, option };
        });
    } catch (err) {
        console.warn('初始化 uTools 监听失败：', err);
    }
}

export function useUtoolsEnterData() {
    return utoolsEnterEventData
}

export default {
    init: initUtoolsListener
}
