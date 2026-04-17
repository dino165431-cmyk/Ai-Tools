import { DIAGRAM_KINDS } from '@/utils/noteDiagramConfig'
import { buildEchartsOptionSnippetFromSelection } from '@/utils/echartsDataTransform'

const EDITABLE_MARKER_RE = /\[\[(.*?)\]\]/g

function createTemplateItem(kind, group, item) {
  return {
    type: 'template',
    persistable: true,
    kind,
    group,
    keywords: [],
    ...item
  }
}

function createActionItem(kind, group, item) {
  return {
    type: 'action',
    persistable: false,
    kind,
    group,
    keywords: [],
    ...item
  }
}

function compileEditableTemplate(source) {
  const raw = String(source || '')
  let clean = ''
  let cursor = 0
  let selectStart = -1
  let selectEnd = -1

  raw.replace(EDITABLE_MARKER_RE, (match, value, offset) => {
    clean += raw.slice(cursor, offset)
    if (selectStart < 0) {
      selectStart = clean.length
      selectEnd = selectStart + String(value || '').length
    }
    clean += String(value || '')
    cursor = offset + match.length
    return match
  })

  clean += raw.slice(cursor)
  return {
    text: clean,
    selectStart,
    selectEnd
  }
}

export function buildDiagramSnippet(kind, source) {
  const language = DIAGRAM_KINDS.includes(kind) ? kind : 'mermaid'
  const compiled = compileEditableTemplate(source)
  const prefix = `\`\`\`${language}\n`
  const suffix = '\n```\n'
  const targetValue = `${prefix}${compiled.text.trim()}\n\`\`\`\n`

  if (compiled.selectStart < 0 || compiled.selectEnd < 0) {
    return {
      targetValue,
      select: false,
      deviationStart: 0,
      deviationEnd: 0
    }
  }

  const absoluteStart = prefix.length + compiled.selectStart
  const absoluteEnd = prefix.length + compiled.selectEnd
  return {
    targetValue,
    select: true,
    deviationStart: absoluteStart,
    deviationEnd: absoluteEnd - targetValue.length
  }
}

function buildSnippetForTemplateItem(item) {
  return buildDiagramSnippet(item.kind, item.template)
}

function buildSnippetForActionItem(item, selectedText) {
  const source = item.buildTemplateFromSelection?.(selectedText)
  if (!source) return null
  return buildDiagramSnippet(item.kind, source)
}

export function buildSnippetForDiagramItem(item, options = {}) {
  if (!item || typeof item !== 'object') return null
  if (item.type === 'action') {
    return buildSnippetForActionItem(item, options.selectedText)
  }
  return buildSnippetForTemplateItem(item)
}

function groupItems(title, items) {
  return {
    title,
    items
  }
}

function createMermaidGroups() {
  return [
    groupItems('常用图', [
      createTemplateItem('mermaid', '常用图', {
        id: 'mermaid:flowchart',
        label: '流程图',
        syntax: 'flowchart',
        keywords: ['流程', 'flow', 'workflow'],
        template: `flowchart TD
  A[开始] --> B[处理中]
  B --> C[完成]`
      }),
      createTemplateItem('mermaid', '常用图', {
        id: 'mermaid:sequence',
        label: '时序图',
        syntax: 'sequenceDiagram',
        keywords: ['时序', 'sequence'],
        template: `sequenceDiagram
  participant Client as 客户端
  participant Server as 服务端
  Client->>Server: 发起请求
  Server-->>Client: 返回结果`
      }),
      createTemplateItem('mermaid', '常用图', {
        id: 'mermaid:gantt',
        label: '甘特图',
        syntax: 'gantt',
        keywords: ['甘特', '计划', '排期'],
        template: `gantt
  title 项目排期
  dateFormat  YYYY-MM-DD
  section Phase 1
  Kickoff :done, 2026-04-01, 1d
  Build :active, 2026-04-02, 4d`
      }),
      createTemplateItem('mermaid', '常用图', {
        id: 'mermaid:class',
        label: '类图',
        syntax: 'classDiagram',
        keywords: ['类图', 'class', 'uml'],
        template: `classDiagram
  class Animal
  class Dog
  Animal <|-- Dog`
      }),
      createTemplateItem('mermaid', '常用图', {
        id: 'mermaid:state',
        label: '状态图',
        syntax: 'stateDiagram-v2',
        keywords: ['状态图', 'state'],
        template: `stateDiagram-v2
  [*] --> Idle
  Idle --> Running
  Running --> [*]`
      }),
      createTemplateItem('mermaid', '常用图', {
        id: 'mermaid:er',
        label: 'ER 图',
        syntax: 'erDiagram',
        keywords: ['实体关系', 'er', 'database'],
        template: `erDiagram
  USER ||--o{ ORDER : places
  ORDER ||--|{ ORDER_ITEM : contains`
      }),
      createTemplateItem('mermaid', '常用图', {
        id: 'mermaid:pie',
        label: '饼图',
        syntax: 'pie',
        keywords: ['饼图', 'pie'],
        template: `pie
  title 设备占比
  "Desktop" : 386
  "Mobile" : 185
  "Tablet" : 85`
      }),
      createTemplateItem('mermaid', '常用图', {
        id: 'mermaid:journey',
        label: '旅程图',
        syntax: 'journey',
        keywords: ['旅程图', 'journey', 'user'],
        template: `journey
  title 用户旅程
  section Morning
    打开应用: 5: Me
    开始处理: 4: Me`
      }),
      createTemplateItem('mermaid', '常用图', {
        id: 'mermaid:git',
        label: 'Git 图',
        syntax: 'gitGraph',
        keywords: ['git', 'branch', 'merge'],
        template: `gitGraph
  commit id:"init"
  branch develop
  checkout develop
  commit
  checkout main
  merge develop`
      })
    ]),
    groupItems('图表与分析', [
      createTemplateItem('mermaid', '图表与分析', {
        id: 'mermaid:info',
        label: '信息图',
        syntax: 'info',
        keywords: ['info'],
        template: 'info'
      }),
      createTemplateItem('mermaid', '图表与分析', {
        id: 'mermaid:quadrant',
        label: '象限图',
        syntax: 'quadrantChart',
        keywords: ['象限', 'quadrant'],
        template: `quadrantChart
  title 影响力矩阵
  x-axis Low --> High
  y-axis Low --> High
  quadrant-1 Invest
  quadrant-2 Explore
  quadrant-3 Deprioritize
  quadrant-4 Monitor
  Feature A: [0.75, 0.80]`
      }),
      createTemplateItem('mermaid', '图表与分析', {
        id: 'mermaid:xychart',
        label: 'XY 图',
        syntax: 'xychart-beta',
        keywords: ['xy', 'bar', 'line'],
        template: `xychart-beta
  title "月度趋势"
  x-axis [Jan, Feb, Mar, Apr]
  y-axis "Revenue" 0 --> 100
  bar [35, 48, 61, 79]
  line [28, 40, 55, 72]`
      }),
      createTemplateItem('mermaid', '图表与分析', {
        id: 'mermaid:requirement',
        label: '需求图',
        syntax: 'requirementDiagram',
        keywords: ['requirement', '需求'],
        template: `requirementDiagram
  requirement user_login {
    id: 1
    text: User logs in
    risk: low
    verifymethod: test
  }`
      }),
      createTemplateItem('mermaid', '图表与分析', {
        id: 'mermaid:timeline',
        label: '时间线',
        syntax: 'timeline',
        keywords: ['timeline', 'roadmap'],
        template: `timeline
  title 产品路线图
  2024 : Planning
  2025 : Build
  2026 : Launch`
      }),
      createTemplateItem('mermaid', '图表与分析', {
        id: 'mermaid:mindmap',
        label: '思维导图',
        syntax: 'mindmap',
        keywords: ['mindmap', '脑图'],
        template: `mindmap
  root((Project))
    Research
    Design
    Build
      Backend
      Frontend`
      }),
      createTemplateItem('mermaid', '图表与分析', {
        id: 'mermaid:sankey',
        label: '桑基图',
        syntax: 'sankey-beta',
        keywords: ['sankey', '流向'],
        template: `sankey-beta
source,target,value
Marketing,Visits,120
Visits,Signups,45
Signups,Customers,18`
      }),
      createTemplateItem('mermaid', '图表与分析', {
        id: 'mermaid:packet',
        label: '包结构图',
        syntax: 'packet',
        keywords: ['packet', 'network'],
        template: `packet
  0-3: "Version"
  4-7: "IHL"
  8-15: "Type"
  16-31: "Length"`
      }),
      createTemplateItem('mermaid', '图表与分析', {
        id: 'mermaid:radar',
        label: '雷达图',
        syntax: 'radar-beta',
        keywords: ['radar', '雷达'],
        template: `radar-beta
  axis speed, quality, cost
  curve plan{4,5,2}
  curve actual{3,4,4}`
      }),
      createTemplateItem('mermaid', '图表与分析', {
        id: 'mermaid:treemap',
        label: '矩形树图',
        syntax: 'treemap',
        keywords: ['treemap'],
        template: `treemap
  "Project"
    "Frontend": 40
    "Backend": 60`
      })
    ]),
    groupItems('系统与结构', [
      createTemplateItem('mermaid', '系统与结构', {
        id: 'mermaid:kanban',
        label: '看板图',
        syntax: 'kanban',
        keywords: ['kanban', 'board'],
        template: `kanban
  todo[Todo]
    docs[Write docs]
    api[Define API]
  doing[Doing]
    ui[Build UI]
  done[Done]
    ship[Ship v1]`
      }),
      createTemplateItem('mermaid', '系统与结构', {
        id: 'mermaid:block',
        label: '块图',
        syntax: 'block-beta',
        keywords: ['block'],
        template: `block-beta
  columns 3
  one["Source"] two["Transform"] three["Result"]
  one --> two --> three`
      }),
      createTemplateItem('mermaid', '系统与结构', {
        id: 'mermaid:architecture',
        label: '架构图',
        syntax: 'architecture-beta',
        keywords: ['architecture', '架构'],
        template: `architecture-beta
  group api(cloud)[API]
  service app(server)[App] in api
  service db(database)[Database] in api
  app:R --> L:db`
      })
    ]),
    groupItems('C4', [
      createTemplateItem('mermaid', 'C4', {
        id: 'mermaid:c4-context',
        label: 'System Context',
        syntax: 'C4Context',
        keywords: ['c4', 'context'],
        template: `C4Context
title System Context
Person(user, "User")
System(app, "App")
System_Ext(mail, "Email Service")
Rel(user, app, "Uses")
Rel(app, mail, "Sends mail")`
      }),
      createTemplateItem('mermaid', 'C4', {
        id: 'mermaid:c4-container',
        label: 'Container',
        syntax: 'C4Container',
        keywords: ['c4', 'container'],
        template: `C4Container
title Container Diagram
Person(user, "User")
System_Boundary(system, "Platform") {
  Container(web, "Web App", "Vue")
  ContainerDb(db, "Database", "PostgreSQL")
}
Rel(user, web, "Uses")
Rel(web, db, "Reads/Writes")`
      }),
      createTemplateItem('mermaid', 'C4', {
        id: 'mermaid:c4-component',
        label: 'Component',
        syntax: 'C4Component',
        keywords: ['c4', 'component'],
        template: `C4Component
title Component Diagram
Container_Boundary(app, "Web App") {
  Component(ui, "UI Layer", "Vue")
  Component(api, "API Layer", "Node.js")
  ComponentDb(store, "Data Store", "SQLite")
}
Rel(ui, api, "Calls")
Rel(api, store, "Reads/Writes")`
      }),
      createTemplateItem('mermaid', 'C4', {
        id: 'mermaid:c4-dynamic',
        label: 'Dynamic',
        syntax: 'C4Dynamic',
        keywords: ['c4', 'dynamic'],
        template: `C4Dynamic
title Request Flow
Person(user, "User")
System(app, "App")
SystemDb(db, "Database")
Rel(user, app, "Submit form")
Rel(app, db, "Save record")`
      }),
      createTemplateItem('mermaid', 'C4', {
        id: 'mermaid:c4-deployment',
        label: 'Deployment',
        syntax: 'C4Deployment',
        keywords: ['c4', 'deployment'],
        template: `C4Deployment
title Deployment Diagram
Deployment_Node(client, "Client", "Browser") {
  Container(browser, "Browser")
}
Deployment_Node(server, "Server", "Linux") {
  Container(web, "Web App", "Docker")
  ContainerDb(db, "Database", "PostgreSQL")
}
Rel(browser, web, "HTTPS")
Rel(web, db, "TCP")`
      })
    ])
  ]
}

function createEchartsGroups() {
  return [
    groupItems('数据转换', [
      createActionItem('echarts', '数据转换', {
        id: 'echarts:selection-bar',
        label: '表格/JSON 转柱状图',
        syntax: 'data->bar',
        keywords: ['table', 'json', 'data', 'bar'],
        buildTemplateFromSelection(selectedText) {
          return buildEchartsOptionSnippetFromSelection(selectedText, { chartType: 'bar' })
        }
      }),
      createActionItem('echarts', '数据转换', {
        id: 'echarts:selection-line',
        label: '表格/JSON 转折线图',
        syntax: 'data->line',
        keywords: ['table', 'json', 'data', 'line'],
        buildTemplateFromSelection(selectedText) {
          return buildEchartsOptionSnippetFromSelection(selectedText, { chartType: 'line' })
        }
      })
    ]),
    groupItems('趋势与对比', [
      createTemplateItem('echarts', '趋势与对比', {
        id: 'echarts:line',
        label: '折线图',
        syntax: 'line',
        keywords: ['line', '折线'],
        template: `{
  title: {
    text: '[[趋势标题]]'
  },
  tooltip: {
    trigger: 'axis'
  },
  xAxis: {
    type: 'category',
    name: 'X 轴',
    data: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  },
  yAxis: {
    type: 'value',
    name: '数值'
  },
  series: [
    {
      name: '系列名称',
      type: 'line',
      smooth: true,
      data: [120, 200, 150, 80, 70, 110, 130]
    }
  ]
}`
      }),
      createTemplateItem('echarts', '趋势与对比', {
        id: 'echarts:bar',
        label: '柱状图',
        syntax: 'bar',
        keywords: ['bar', '柱状'],
        template: `{
  title: {
    text: '[[图表标题]]'
  },
  tooltip: {
    trigger: 'axis'
  },
  xAxis: {
    type: 'category',
    name: 'X 轴',
    data: ['Q1', 'Q2', 'Q3', 'Q4']
  },
  yAxis: {
    type: 'value',
    name: '数值'
  },
  series: [
    {
      name: '系列名称',
      type: 'bar',
      barWidth: '44%',
      data: [320, 432, 501, 634]
    }
  ]
}`
      }),
      createTemplateItem('echarts', '趋势与对比', {
        id: 'echarts:bar-horizontal',
        label: '横向柱状图',
        syntax: 'bar-horizontal',
        keywords: ['horizontal', 'bar', '横向'],
        template: `{
  title: {
    text: '[[图表标题]]'
  },
  tooltip: {
    trigger: 'axis',
    axisPointer: {
      type: 'shadow'
    }
  },
  xAxis: {
    type: 'value',
    name: '数值'
  },
  yAxis: {
    type: 'category',
    name: '分类',
    data: ['华东', '华南', '华北', '西南']
  },
  series: [
    {
      name: '系列名称',
      type: 'bar',
      data: [320, 280, 240, 190]
    }
  ]
}`
      }),
      createTemplateItem('echarts', '趋势与对比', {
        id: 'echarts:stacked-bar',
        label: '堆叠柱状图',
        syntax: 'stacked-bar',
        keywords: ['stack', 'bar', '堆叠'],
        template: `{
  title: {
    text: '[[来源分布]]'
  },
  tooltip: {
    trigger: 'axis',
    axisPointer: {
      type: 'shadow'
    }
  },
  legend: {},
  xAxis: {
    type: 'category',
    data: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  },
  yAxis: {
    type: 'value'
  },
  series: [
    {
      name: 'Search',
      type: 'bar',
      stack: 'total',
      data: [120, 132, 101, 134, 90]
    },
    {
      name: 'Direct',
      type: 'bar',
      stack: 'total',
      data: [220, 182, 191, 234, 290]
    },
    {
      name: 'Referral',
      type: 'bar',
      stack: 'total',
      data: [150, 232, 201, 154, 190]
    }
  ]
}`
      }),
      createTemplateItem('echarts', '趋势与对比', {
        id: 'echarts:area',
        label: '面积图',
        syntax: 'area',
        keywords: ['area', '面积'],
        template: `{
  title: {
    text: '[[增长趋势]]'
  },
  tooltip: {
    trigger: 'axis'
  },
  xAxis: {
    type: 'category',
    boundaryGap: false,
    data: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']
  },
  yAxis: {
    type: 'value'
  },
  series: [
    {
      name: '系列名称',
      type: 'line',
      smooth: true,
      areaStyle: {},
      data: [32, 41, 58, 47, 69, 76]
    }
  ]
}`
      })
    ]),
    groupItems('占比与分布', [
      createTemplateItem('echarts', '占比与分布', {
        id: 'echarts:pie',
        label: '饼图',
        syntax: 'pie',
        keywords: ['pie', '饼图'],
        template: `{
  title: {
    text: '[[占比标题]]',
    left: 'center'
  },
  tooltip: {
    trigger: 'item'
  },
  legend: {
    bottom: 0
  },
  series: [
    {
      name: '系列名称',
      type: 'pie',
      radius: '68%',
      data: [
        { value: 1048, name: 'Desktop' },
        { value: 735, name: 'Mobile' },
        { value: 580, name: 'Tablet' },
        { value: 484, name: 'Other' }
      ]
    }
  ]
}`
      }),
      createTemplateItem('echarts', '占比与分布', {
        id: 'echarts:donut',
        label: '环形图',
        syntax: 'donut',
        keywords: ['donut', 'ring', '环形'],
        template: `{
  title: {
    text: '[[设备占比]]',
    left: 'center'
  },
  tooltip: {
    trigger: 'item'
  },
  legend: {
    bottom: 0
  },
  series: [
    {
      name: '系列名称',
      type: 'pie',
      radius: ['42%', '70%'],
      itemStyle: {
        borderRadius: 8,
        borderColor: '#fff',
        borderWidth: 2
      },
      data: [
        { value: 1048, name: 'Desktop' },
        { value: 735, name: 'Mobile' },
        { value: 580, name: 'Tablet' },
        { value: 484, name: 'Other' }
      ]
    }
  ]
}`
      }),
      createTemplateItem('echarts', '占比与分布', {
        id: 'echarts:scatter',
        label: '散点图',
        syntax: 'scatter',
        keywords: ['scatter', '散点'],
        template: `{
  title: {
    text: '[[相关性分析]]'
  },
  tooltip: {
    trigger: 'item'
  },
  xAxis: {
    type: 'value',
    name: 'Price'
  },
  yAxis: {
    type: 'value',
    name: 'Sales'
  },
  series: [
    {
      name: 'Products',
      type: 'scatter',
      symbolSize: 14,
      data: [
        [12, 140],
        [18, 120],
        [25, 98],
        [30, 76],
        [38, 68],
        [45, 52]
      ]
    }
  ]
}`
      }),
      createTemplateItem('echarts', '占比与分布', {
        id: 'echarts:radar',
        label: '雷达图',
        syntax: 'radar',
        keywords: ['radar', '雷达'],
        template: `{
  title: {
    text: '[[能力评估]]'
  },
  legend: {
    bottom: 0
  },
  radar: {
    indicator: [
      { name: 'Quality', max: 100 },
      { name: 'Speed', max: 100 },
      { name: 'Cost', max: 100 },
      { name: 'Risk', max: 100 },
      { name: 'Collaboration', max: 100 }
    ]
  },
  series: [
    {
      type: 'radar',
      data: [
        {
          value: [85, 78, 66, 52, 90],
          name: 'Current'
        },
        {
          value: [92, 88, 72, 45, 94],
          name: 'Target'
        }
      ]
    }
  ]
}`
      }),
      createTemplateItem('echarts', '占比与分布', {
        id: 'echarts:heatmap',
        label: '热力图',
        syntax: 'heatmap',
        keywords: ['heatmap', '热力图'],
        template: `{
  title: {
    text: '[[热力图标题]]'
  },
  tooltip: {
    position: 'top'
  },
  xAxis: {
    type: 'category',
    data: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  },
  yAxis: {
    type: 'category',
    data: ['Morning', 'Noon', 'Afternoon', 'Night']
  },
  visualMap: {
    min: 0,
    max: 10,
    calculable: true,
    orient: 'horizontal',
    left: 'center',
    bottom: 0
  },
  series: [
    {
      name: 'Heat',
      type: 'heatmap',
      label: {
        show: true
      },
      data: [
        [0, 0, 5],
        [1, 0, 1],
        [2, 0, 0],
        [3, 0, 2],
        [4, 0, 3],
        [5, 0, 4],
        [6, 0, 2]
      ]
    }
  ]
}`
      })
    ]),
    groupItems('业务常用', [
      createTemplateItem('echarts', '业务常用', {
        id: 'echarts:dual-axis',
        label: '双轴图',
        syntax: 'dual-axis',
        keywords: ['dual', '双轴', 'combo'],
        template: `{
  title: {
    text: '[[订单与转化率]]'
  },
  tooltip: {
    trigger: 'axis'
  },
  legend: {},
  xAxis: {
    type: 'category',
    data: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']
  },
  yAxis: [
    {
      type: 'value',
      name: 'Orders'
    },
    {
      type: 'value',
      name: 'Conversion',
      axisLabel: {
        formatter: '{value}%'
      }
    }
  ],
  series: [
    {
      name: 'Orders',
      type: 'bar',
      data: [120, 142, 161, 194, 210, 230]
    },
    {
      name: 'Conversion',
      type: 'line',
      yAxisIndex: 1,
      smooth: true,
      data: [3.1, 3.8, 4.2, 4.9, 5.1, 5.6]
    }
  ]
}`
      }),
      createTemplateItem('echarts', '业务常用', {
        id: 'echarts:funnel',
        label: '漏斗图',
        syntax: 'funnel',
        keywords: ['funnel', '漏斗'],
        template: `{
  title: {
    text: '[[转化漏斗]]'
  },
  tooltip: {
    trigger: 'item',
    formatter: '{b}: {c}'
  },
  series: [
    {
      name: 'Funnel',
      type: 'funnel',
      left: '10%',
      top: 40,
      bottom: 24,
      width: '80%',
      min: 0,
      max: 100,
      sort: 'descending',
      gap: 4,
      label: {
        show: true,
        position: 'inside'
      },
      data: [
        { value: 100, name: '曝光' },
        { value: 80, name: '点击' },
        { value: 45, name: '注册' },
        { value: 22, name: '付费' }
      ]
    }
  ]
}`
      }),
      createTemplateItem('echarts', '业务常用', {
        id: 'echarts:gauge',
        label: '仪表盘',
        syntax: 'gauge',
        keywords: ['gauge', '仪表盘'],
        template: `{
  title: {
    text: '[[达成率]]'
  },
  series: [
    {
      name: 'Progress',
      type: 'gauge',
      progress: {
        show: true,
        width: 18
      },
      axisLine: {
        lineStyle: {
          width: 18
        }
      },
      detail: {
        valueAnimation: true,
        formatter: '{value}%'
      },
      data: [
        {
          value: 76,
          name: '完成率'
        }
      ]
    }
  ]
}`
      })
    ])
  ]
}

export const NOTE_DIAGRAM_TEMPLATE_REGISTRY = Object.freeze({
  mermaid: Object.freeze({
    toolbarTitle: 'Mermaid 图',
    groups: Object.freeze(createMermaidGroups())
  }),
  echarts: Object.freeze({
    toolbarTitle: 'ECharts 图',
    groups: Object.freeze(createEchartsGroups())
  })
})

export function getDiagramTemplateRegistry(kind) {
  const normalizedKind = DIAGRAM_KINDS.includes(kind) ? kind : 'mermaid'
  return NOTE_DIAGRAM_TEMPLATE_REGISTRY[normalizedKind]
}

export function getBuiltinDiagramTemplateGroups(kind) {
  return getDiagramTemplateRegistry(kind).groups
}

export function flattenDiagramTemplateGroups(groups) {
  return (Array.isArray(groups) ? groups : []).flatMap((group) =>
    (Array.isArray(group?.items) ? group.items : []).map((item) => ({
      ...item,
      group: String(item?.group || group?.title || '')
    }))
  )
}

export function getBuiltinDiagramTemplates(kind) {
  return flattenDiagramTemplateGroups(getBuiltinDiagramTemplateGroups(kind)).filter((item) => item.type === 'template')
}

export function groupCustomDiagramTemplates(customTemplates, kind) {
  const targetKind = DIAGRAM_KINDS.includes(kind) ? kind : 'mermaid'
  const groups = new Map()

  ;(Array.isArray(customTemplates) ? customTemplates : []).forEach((item) => {
    if (item?.kind && item.kind !== targetKind) return
    const title = String(item?.group || '自定义').trim() || '自定义'
    const entry = groups.get(title) || []
    entry.push({
      ...item,
      kind: targetKind,
      type: 'template',
      persistable: true,
      group: title,
      keywords: Array.isArray(item?.keywords) ? item.keywords : []
    })
    groups.set(title, entry)
  })

  return Array.from(groups.entries()).map(([title, items]) => ({ title, items }))
}
