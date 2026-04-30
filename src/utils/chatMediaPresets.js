export const MEDIA_GENERATION_PRESETS = [
  {
    key: 'image-avatar',
    kind: 'image',
    label: '头像',
    promptPrefix: '头像，1:1，主体清晰，干净背景：',
    paramsEnabled: true,
    params: { size: '1024x1024' }
  },
  {
    key: 'image-icon',
    kind: 'image',
    label: '图标',
    promptPrefix: '应用图标，1:1，简洁符号化，边缘清晰，适合小尺寸识别：',
    paramsEnabled: true,
    params: { size: '1024x1024' }
  },
  {
    key: 'image-logo',
    kind: 'image',
    label: 'Logo',
    promptPrefix: 'Logo 设计，1:1，简洁可识别，干净背景，避免复杂细节：',
    paramsEnabled: true,
    params: { size: '1024x1024' }
  },
  {
    key: 'image-cover',
    kind: 'image',
    label: '封面图',
    promptPrefix: '封面图，16:9，标题空间充足，视觉焦点明确：',
    paramsEnabled: true,
    params: { size: '1536x1024' }
  },
  {
    key: 'image-thumbnail',
    kind: 'image',
    label: '视频封面',
    promptPrefix: '视频封面，16:9，高对比度，主体醒目，适合缩略图浏览：',
    paramsEnabled: true,
    params: { size: '1536x1024', quality: 'high' }
  },
  {
    key: 'image-article',
    kind: 'image',
    label: '文章配图',
    promptPrefix: '文章配图，16:9，干净构图，适合正文插图：',
    paramsEnabled: true,
    params: { size: '1536x1024' }
  },
  {
    key: 'image-poster',
    kind: 'image',
    label: '竖版海报',
    promptPrefix: '竖版海报，9:16，层级清晰，视觉中心明确，适合手机端传播：',
    paramsEnabled: true,
    params: { size: '1024x1536', quality: 'high' }
  },
  {
    key: 'image-social-square',
    kind: 'image',
    label: '社媒方图',
    promptPrefix: '社媒方图，1:1，构图紧凑，主题一眼可读，适合信息流展示：',
    paramsEnabled: true,
    params: { size: '1024x1024' }
  },
  {
    key: 'image-story',
    kind: 'image',
    label: '故事竖图',
    promptPrefix: '社媒故事图，9:16，留出文字空间，视觉干净，适合手机全屏展示：',
    paramsEnabled: true,
    params: { size: '1024x1536' }
  },
  {
    key: 'image-banner',
    kind: 'image',
    label: '横幅 Banner',
    promptPrefix: '横幅 Banner，宽屏构图，主体居中或偏一侧，留出文案空间：',
    paramsEnabled: true,
    params: { size: '1536x1024' }
  },
  {
    key: 'image-product-shot',
    kind: 'image',
    label: '商品主图',
    promptPrefix: '商品主图，主体完整清晰，干净背景，商业摄影质感，突出材质和细节：',
    paramsEnabled: true,
    params: { size: '1024x1024', quality: 'high' }
  },
  {
    key: 'image-product-scene',
    kind: 'image',
    label: '商品场景图',
    promptPrefix: '商品场景图，真实使用环境，光线自然，突出产品价值和生活方式：',
    paramsEnabled: true,
    params: { size: '1536x1024', quality: 'high' }
  },
  {
    key: 'image-infographic',
    kind: 'image',
    label: '信息图',
    promptPrefix: '信息图，结构清晰，模块分区明确，图形化表达，文字区域留白充足：',
    paramsEnabled: true,
    params: { size: '1536x1024' }
  },
  {
    key: 'image-desktop-wallpaper',
    kind: 'image',
    label: '桌面壁纸',
    promptPrefix: '桌面壁纸，16:9，画面沉浸，细节丰富，无文字，适合作为背景：',
    paramsEnabled: true,
    params: { size: '1536x1024', quality: 'high' }
  },
  {
    key: 'image-phone-wallpaper',
    kind: 'image',
    label: '手机壁纸',
    promptPrefix: '手机壁纸，9:16，纵向构图，主体不过度贴边，无文字，适合锁屏：',
    paramsEnabled: true,
    params: { size: '1024x1536', quality: 'high' }
  },
  {
    key: 'image-concept-art',
    kind: 'image',
    label: '概念设定',
    promptPrefix: '概念设定图，氛围明确，细节丰富，造型可信，适合创意探索：',
    paramsEnabled: true,
    params: { size: '1536x1024', quality: 'high' }
  },
  {
    key: 'video-short',
    kind: 'video',
    label: '短视频',
    promptPrefix: '短视频，9:16，4 秒，镜头运动自然，主体清晰：',
    paramsEnabled: true,
    params: { size: '720x1280', aspect_ratio: '9:16', duration: 4 }
  },
  {
    key: 'video-landscape-promo',
    kind: 'video',
    label: '横版宣传片',
    promptPrefix: '横版宣传视频，16:9，8 秒，节奏清晰，镜头稳定，突出核心卖点：',
    paramsEnabled: true,
    params: { size: '1280x720', aspect_ratio: '16:9', duration: 8 }
  },
  {
    key: 'video-product-demo',
    kind: 'video',
    label: '产品演示',
    promptPrefix: '产品演示视频，16:9，8 秒，展示产品外观、关键功能和使用场景：',
    paramsEnabled: true,
    params: { size: '1280x720', aspect_ratio: '16:9', duration: 8 }
  },
  {
    key: 'video-product-spin',
    kind: 'video',
    label: '商品转台',
    promptPrefix: '商品转台视频，4 秒，产品缓慢旋转，光线干净，背景简洁，突出材质细节：',
    paramsEnabled: true,
    params: { size: '1280x720', aspect_ratio: '16:9', duration: 4 }
  },
  {
    key: 'video-cinematic',
    kind: 'video',
    label: '电影感镜头',
    promptPrefix: '电影感镜头，16:9，8 秒，景深自然，光影有层次，镜头运动克制：',
    paramsEnabled: true,
    params: { size: '1280x720', aspect_ratio: '16:9', duration: 8 }
  },
  {
    key: 'video-loop',
    kind: 'video',
    label: '循环动图',
    promptPrefix: '无缝循环动图，短循环，动作自然衔接，画面稳定，适合作为动态素材：',
    paramsEnabled: true,
    params: { size: '1280x720', aspect_ratio: '16:9', duration: 4 }
  },
  {
    key: 'video-hero-bg',
    kind: 'video',
    label: '网页背景',
    promptPrefix: '网页 Hero 背景视频，16:9，8 秒，慢节奏，低干扰，无文字，适合作为页面背景：',
    paramsEnabled: true,
    params: { size: '1280x720', aspect_ratio: '16:9', duration: 8 }
  },
  {
    key: 'video-intro',
    kind: 'video',
    label: '开场片头',
    promptPrefix: '开场片头，16:9，4 秒，节奏利落，视觉冲击明确，适合作为视频开头：',
    paramsEnabled: true,
    params: { size: '1280x720', aspect_ratio: '16:9', duration: 4 }
  },
  {
    key: 'video-story-ad',
    kind: 'video',
    label: '竖版广告',
    promptPrefix: '竖版广告视频，9:16，8 秒，开头抓眼，主体清晰，适合手机端投放：',
    paramsEnabled: true,
    params: { size: '720x1280', aspect_ratio: '9:16', duration: 8 }
  }
]

export function resolveMediaGenerationPreset(key, presets = MEDIA_GENERATION_PRESETS) {
  const target = String(key || '').trim()
  if (!target) return null
  return (Array.isArray(presets) ? presets : []).find((preset) => preset?.key === target) || null
}

export function buildMediaGenerationPresetOptions(presets = MEDIA_GENERATION_PRESETS) {
  const imageOptions = buildPresetOptionsByKind('image', presets)
  const videoOptions = buildPresetOptionsByKind('video', presets)
  return [
    imageOptions.length ? { type: 'group', key: 'image-presets', label: '图片', children: imageOptions } : null,
    videoOptions.length ? { type: 'group', key: 'video-presets', label: '视频', children: videoOptions } : null
  ].filter(Boolean)
}

function buildPresetOptionsByKind(kind, presets = MEDIA_GENERATION_PRESETS) {
  return (Array.isArray(presets) ? presets : []).filter((preset) => preset?.kind === kind).map((preset) => ({
    key: preset.key,
    label: preset.label
  }))
}

export function applyMediaGenerationPresetToInput(inputText, key, presets = MEDIA_GENERATION_PRESETS) {
  const preset = resolveMediaGenerationPreset(key, presets)
  if (!preset) return null

  const current = String(inputText || '').trim()
  const prefix = String(preset.promptPrefix || '').trim()
  return {
    preset,
    kind: preset.kind === 'video' ? 'video' : 'image',
    text: current ? `${prefix}${current}` : prefix,
    paramsEnabled: preset.paramsEnabled === true,
    params: preset.params && typeof preset.params === 'object' ? { ...preset.params } : {}
  }
}
