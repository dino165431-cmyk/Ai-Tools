import { h } from 'vue'

function renderToolbarIcon(paths = []) {
  return h(
    'svg',
    {
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '1.8',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round'
    },
    paths.map((attrs) => h('path', attrs))
  )
}

export const CollapseCellIcon = {
  name: 'CollapseCellIcon',
  render() {
    return renderToolbarIcon([
      { d: 'M5 6h14' },
      { d: 'M5 18h14' },
      { d: 'm8.5 14 3.5-4 3.5 4' }
    ])
  }
}

export const ExpandCellIcon = {
  name: 'ExpandCellIcon',
  render() {
    return renderToolbarIcon([
      { d: 'M5 6h14' },
      { d: 'M5 18h14' },
      { d: 'm8.5 10 3.5 4 3.5-4' }
    ])
  }
}

export const LayersClearIcon = {
  name: 'LayersClearIcon',
  render() {
    return renderToolbarIcon([
      { d: 'M12 3 3 8l9 5 9-5-9-5Z' },
      { d: 'm3 12 9 5 9-5' },
      { d: 'm3 16 9 5 9-5' },
      { d: 'm6 6 12 12' }
    ])
  }
}
