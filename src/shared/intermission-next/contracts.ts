export const INTERMISSION_NEXT_LAYOUT_VERSION = 4 as const
export const INTERMISSION_NEXT_TRANSITION_COMPONENT_DURATION_MS = 1_400
export const INTERMISSION_NEXT_CANVAS_WIDTH = 1920
export const INTERMISSION_NEXT_CANVAS_HEIGHT = 1080
export const INTERMISSION_NEXT_SNAP_THRESHOLD = 8

export const INTERMISSION_NEXT_SAFE_AREA = {
  x: 60,
  y: 60,
  width: 1800,
  height: 960
} as const

export const INTERMISSION_NEXT_PAGE_IDS = [
  'warmup',
  'bp',
  'map_break',
  'series_end',
  'standby'
] as const
export const INTERMISSION_NEXT_RESIZE_HANDLES = [
  'north',
  'north_east',
  'east',
  'south_east',
  'south',
  'south_west',
  'west',
  'north_west'
] as const

export type IntermissionNextPageId = (typeof INTERMISSION_NEXT_PAGE_IDS)[number]
export type IntermissionNextResizeHandle = (typeof INTERMISSION_NEXT_RESIZE_HANDLES)[number]

export interface IntermissionNextBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface IntermissionNextComponentLayout extends IntermissionNextBounds {
  aspectRatioLocked: boolean
}

export interface IntermissionNextComponentWindow {
  id: string
  startOffsetMs: number
  endOffsetMs: number | null
}

export interface IntermissionNextTransitionComponent {
  id: string
  startOffsetMs: number
  durationMs: typeof INTERMISSION_NEXT_TRANSITION_COMPONENT_DURATION_MS
}

export interface IntermissionNextComponentSizeConstraints {
  minimumWidth: number
  minimumHeight: number
  maximumWidth: number
  maximumHeight: number
}

export interface IntermissionNextComponentDefinition<Id extends string = string> {
  id: Id
  label: string
  kind?: 'standard' | 'utility_replay' | 'transition'
  canvasEditable?: boolean
  required?: boolean
  defaultLayout: IntermissionNextComponentLayout
  sizeConstraints: IntermissionNextComponentSizeConstraints
}

const WARMUP_COMPONENT_DEFINITIONS = [
  {
    id: 'brandTransition',
    label: '页面内转场组件',
    kind: 'transition',
    canvasEditable: false,
    defaultLayout: {
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      aspectRatioLocked: true
    },
    sizeConstraints: {
      minimumWidth: 1920,
      minimumHeight: 1080,
      maximumWidth: 1920,
      maximumHeight: 1080
    }
  },
  {
    id: 'eventBrand',
    label: '赛事品牌展示',
    defaultLayout: {
      x: 180,
      y: 100,
      width: 960,
      height: 220,
      aspectRatioLocked: false
    },
    sizeConstraints: {
      minimumWidth: 480,
      minimumHeight: 120,
      maximumWidth: 1560,
      maximumHeight: 420
    }
  },
  {
    id: 'matchTeams',
    label: '当前比赛双方战队',
    defaultLayout: {
      x: 260,
      y: 390,
      width: 1400,
      height: 300,
      aspectRatioLocked: false
    },
    sizeConstraints: {
      minimumWidth: 800,
      minimumHeight: 180,
      maximumWidth: 1800,
      maximumHeight: 520
    }
  },
  {
    id: 'matchStatus',
    label: '比赛准备状态',
    defaultLayout: {
      x: 560,
      y: 740,
      width: 800,
      height: 120,
      aspectRatioLocked: false
    },
    sizeConstraints: {
      minimumWidth: 420,
      minimumHeight: 80,
      maximumWidth: 1300,
      maximumHeight: 260
    }
  },
  {
    id: 'warmupPrompt',
    label: '暖场提示',
    defaultLayout: {
      x: 560,
      y: 890,
      width: 800,
      height: 100,
      aspectRatioLocked: false
    },
    sizeConstraints: {
      minimumWidth: 420,
      minimumHeight: 72,
      maximumWidth: 1300,
      maximumHeight: 220
    }
  },
  {
    id: 'eventMark',
    label: '页面内赛事标志',
    defaultLayout: {
      x: 1460,
      y: 60,
      width: 340,
      height: 90,
      aspectRatioLocked: true
    },
    sizeConstraints: {
      minimumWidth: 240,
      minimumHeight: 64,
      maximumWidth: 720,
      maximumHeight: 220
    }
  }
] as const satisfies readonly IntermissionNextComponentDefinition[]

const BP_COMPONENT_DEFINITIONS = [
  {
    id: 'brandTransition',
    label: '页面内转场组件',
    kind: 'transition',
    canvasEditable: false,
    defaultLayout: {
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      aspectRatioLocked: true
    },
    sizeConstraints: {
      minimumWidth: 1920,
      minimumHeight: 1080,
      maximumWidth: 1920,
      maximumHeight: 1080
    }
  },
  {
    id: 'bpCore',
    label: 'BP 核心展示',
    canvasEditable: false,
    required: true,
    defaultLayout: {
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      aspectRatioLocked: true
    },
    sizeConstraints: {
      minimumWidth: 1920,
      minimumHeight: 1080,
      maximumWidth: 1920,
      maximumHeight: 1080
    }
  },
  {
    id: 'eventMark',
    label: '页面内赛事标志',
    defaultLayout: {
      x: 1460,
      y: 60,
      width: 340,
      height: 90,
      aspectRatioLocked: true
    },
    sizeConstraints: {
      minimumWidth: 240,
      minimumHeight: 64,
      maximumWidth: 720,
      maximumHeight: 220
    }
  }
] as const satisfies readonly IntermissionNextComponentDefinition[]

const MAP_BREAK_COMPONENT_DEFINITIONS = [
  {
    id: 'brandTransition',
    label: '页面内转场组件',
    kind: 'transition',
    canvasEditable: false,
    defaultLayout: {
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      aspectRatioLocked: true
    },
    sizeConstraints: {
      minimumWidth: 1920,
      minimumHeight: 1080,
      maximumWidth: 1920,
      maximumHeight: 1080
    }
  },
  {
    id: 'utilityReplay',
    label: '本图前 30 秒道具回放',
    kind: 'utility_replay',
    canvasEditable: false,
    defaultLayout: {
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      aspectRatioLocked: true
    },
    sizeConstraints: {
      minimumWidth: 1920,
      minimumHeight: 1080,
      maximumWidth: 1920,
      maximumHeight: 1080
    }
  },
  {
    id: 'mapReport',
    label: '本图完整数据板',
    defaultLayout: {
      x: 180,
      y: 215,
      width: 1560,
      height: 650,
      aspectRatioLocked: false
    },
    sizeConstraints: {
      minimumWidth: 960,
      minimumHeight: 480,
      maximumWidth: 1800,
      maximumHeight: 820
    }
  },
  {
    id: 'mapSequence',
    label: '地图序列展示',
    defaultLayout: {
      x: 180,
      y: 80,
      width: 1180,
      height: 110,
      aspectRatioLocked: false
    },
    sizeConstraints: {
      minimumWidth: 720,
      minimumHeight: 72,
      maximumWidth: 1800,
      maximumHeight: 220
    }
  },
  {
    id: 'nextMap',
    label: '下一张地图展示',
    defaultLayout: {
      x: 180,
      y: 890,
      width: 650,
      height: 140,
      aspectRatioLocked: false
    },
    sizeConstraints: {
      minimumWidth: 360,
      minimumHeight: 96,
      maximumWidth: 960,
      maximumHeight: 300
    }
  },
  {
    id: 'breakTimer',
    label: '地图间倒计时与提示',
    defaultLayout: {
      x: 1290,
      y: 890,
      width: 450,
      height: 140,
      aspectRatioLocked: false
    },
    sizeConstraints: {
      minimumWidth: 320,
      minimumHeight: 96,
      maximumWidth: 720,
      maximumHeight: 300
    }
  },
  {
    id: 'eventMark',
    label: '页面内赛事标志',
    defaultLayout: {
      x: 1460,
      y: 60,
      width: 340,
      height: 90,
      aspectRatioLocked: true
    },
    sizeConstraints: {
      minimumWidth: 240,
      minimumHeight: 64,
      maximumWidth: 720,
      maximumHeight: 220
    }
  }
] as const satisfies readonly IntermissionNextComponentDefinition[]

const SERIES_END_COMPONENT_DEFINITIONS = [
  {
    id: 'brandTransition',
    label: '页面内转场组件',
    kind: 'transition',
    canvasEditable: false,
    defaultLayout: {
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      aspectRatioLocked: true
    },
    sizeConstraints: {
      minimumWidth: 1920,
      minimumHeight: 1080,
      maximumWidth: 1920,
      maximumHeight: 1080
    }
  },
  {
    id: 'utilityReplay',
    label: '本图前 30 秒道具回放',
    kind: 'utility_replay',
    canvasEditable: false,
    defaultLayout: {
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      aspectRatioLocked: true
    },
    sizeConstraints: {
      minimumWidth: 1920,
      minimumHeight: 1080,
      maximumWidth: 1920,
      maximumHeight: 1080
    }
  },
  {
    id: 'winner',
    label: '系列赛获胜方展示',
    defaultLayout: {
      x: 120,
      y: 60,
      width: 1680,
      height: 150,
      aspectRatioLocked: false
    },
    sizeConstraints: {
      minimumWidth: 900,
      minimumHeight: 110,
      maximumWidth: 1800,
      maximumHeight: 280
    }
  },
  {
    id: 'finalScore',
    label: '系列赛最终比分',
    defaultLayout: {
      x: 660,
      y: 230,
      width: 600,
      height: 150,
      aspectRatioLocked: true
    },
    sizeConstraints: {
      minimumWidth: 360,
      minimumHeight: 90,
      maximumWidth: 960,
      maximumHeight: 300
    }
  },
  {
    id: 'completedMapResults',
    label: '已完成地图结果',
    defaultLayout: {
      x: 120,
      y: 410,
      width: 600,
      height: 230,
      aspectRatioLocked: false
    },
    sizeConstraints: {
      minimumWidth: 420,
      minimumHeight: 160,
      maximumWidth: 960,
      maximumHeight: 420
    }
  },
  {
    id: 'mapHistory',
    label: '系列赛地图历史',
    defaultLayout: {
      x: 750,
      y: 410,
      width: 1050,
      height: 230,
      aspectRatioLocked: false
    },
    sizeConstraints: {
      minimumWidth: 600,
      minimumHeight: 160,
      maximumWidth: 1680,
      maximumHeight: 420
    }
  },
  {
    id: 'seriesPlayerStats',
    label: '系列赛选手累计数据',
    defaultLayout: {
      x: 120,
      y: 660,
      width: 1680,
      height: 290,
      aspectRatioLocked: false
    },
    sizeConstraints: {
      minimumWidth: 960,
      minimumHeight: 220,
      maximumWidth: 1800,
      maximumHeight: 500
    }
  },
  {
    id: 'nextMatchStatus',
    label: '下一场比赛状态',
    defaultLayout: {
      x: 120,
      y: 970,
      width: 820,
      height: 80,
      aspectRatioLocked: false
    },
    sizeConstraints: {
      minimumWidth: 420,
      minimumHeight: 64,
      maximumWidth: 1200,
      maximumHeight: 180
    }
  },
  {
    id: 'seriesEndTimer',
    label: '系列赛结束倒计时或提示',
    defaultLayout: {
      x: 970,
      y: 970,
      width: 480,
      height: 80,
      aspectRatioLocked: false
    },
    sizeConstraints: {
      minimumWidth: 320,
      minimumHeight: 64,
      maximumWidth: 720,
      maximumHeight: 180
    }
  },
  {
    id: 'eventMark',
    label: '页面内赛事标志',
    defaultLayout: {
      x: 1480,
      y: 970,
      width: 320,
      height: 80,
      aspectRatioLocked: true
    },
    sizeConstraints: {
      minimumWidth: 240,
      minimumHeight: 60,
      maximumWidth: 720,
      maximumHeight: 180
    }
  }
] as const satisfies readonly IntermissionNextComponentDefinition[]

const STANDBY_COMPONENT_DEFINITIONS = [
  {
    id: 'brandTransition',
    label: '页面内转场组件',
    kind: 'transition',
    canvasEditable: false,
    defaultLayout: {
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      aspectRatioLocked: true
    },
    sizeConstraints: {
      minimumWidth: 1920,
      minimumHeight: 1080,
      maximumWidth: 1920,
      maximumHeight: 1080
    }
  },
  {
    id: 'eventBrand',
    label: '赛事品牌展示',
    defaultLayout: {
      x: 120,
      y: 80,
      width: 760,
      height: 160,
      aspectRatioLocked: false
    },
    sizeConstraints: {
      minimumWidth: 420,
      minimumHeight: 100,
      maximumWidth: 1200,
      maximumHeight: 360
    }
  },
  {
    id: 'previousSeriesResult',
    label: '上一场系列赛简要结果',
    defaultLayout: {
      x: 120,
      y: 320,
      width: 700,
      height: 260,
      aspectRatioLocked: false
    },
    sizeConstraints: {
      minimumWidth: 420,
      minimumHeight: 180,
      maximumWidth: 1100,
      maximumHeight: 480
    }
  },
  {
    id: 'nextMatchStatus',
    label: '下一场比赛准备状态',
    defaultLayout: {
      x: 860,
      y: 320,
      width: 940,
      height: 100,
      aspectRatioLocked: false
    },
    sizeConstraints: {
      minimumWidth: 480,
      minimumHeight: 72,
      maximumWidth: 1500,
      maximumHeight: 220
    }
  },
  {
    id: 'nextTeams',
    label: '下一场双方战队信息',
    defaultLayout: {
      x: 860,
      y: 440,
      width: 940,
      height: 260,
      aspectRatioLocked: false
    },
    sizeConstraints: {
      minimumWidth: 600,
      minimumHeight: 180,
      maximumWidth: 1500,
      maximumHeight: 480
    }
  },
  {
    id: 'startCountdown',
    label: '已知时的开赛倒计时',
    defaultLayout: {
      x: 1120,
      y: 740,
      width: 680,
      height: 180,
      aspectRatioLocked: false
    },
    sizeConstraints: {
      minimumWidth: 420,
      minimumHeight: 120,
      maximumWidth: 1100,
      maximumHeight: 360
    }
  },
  {
    id: 'standbyPrompt',
    label: '未知时的普通待机提示',
    defaultLayout: {
      x: 120,
      y: 740,
      width: 900,
      height: 180,
      aspectRatioLocked: false
    },
    sizeConstraints: {
      minimumWidth: 480,
      minimumHeight: 120,
      maximumWidth: 1400,
      maximumHeight: 360
    }
  },
  {
    id: 'eventMark',
    label: '页面内赛事标志',
    defaultLayout: {
      x: 1440,
      y: 60,
      width: 360,
      height: 96,
      aspectRatioLocked: true
    },
    sizeConstraints: {
      minimumWidth: 240,
      minimumHeight: 64,
      maximumWidth: 720,
      maximumHeight: 192
    }
  }
] as const satisfies readonly IntermissionNextComponentDefinition[]

export const INTERMISSION_NEXT_PAGE_COMPONENT_DEFINITIONS = {
  warmup: WARMUP_COMPONENT_DEFINITIONS,
  bp: BP_COMPONENT_DEFINITIONS,
  map_break: MAP_BREAK_COMPONENT_DEFINITIONS,
  series_end: SERIES_END_COMPONENT_DEFINITIONS,
  standby: STANDBY_COMPONENT_DEFINITIONS
} as const

export type IntermissionNextWarmupComponentId = (typeof WARMUP_COMPONENT_DEFINITIONS)[number]['id']
export type IntermissionNextBPComponentId = (typeof BP_COMPONENT_DEFINITIONS)[number]['id']
export type IntermissionNextMapBreakComponentId =
  (typeof MAP_BREAK_COMPONENT_DEFINITIONS)[number]['id']
export type IntermissionNextSeriesEndComponentId =
  (typeof SERIES_END_COMPONENT_DEFINITIONS)[number]['id']
export type IntermissionNextStandbyComponentId =
  (typeof STANDBY_COMPONENT_DEFINITIONS)[number]['id']

export interface IntermissionNextPageComponentIdMap {
  warmup: IntermissionNextWarmupComponentId
  bp: IntermissionNextBPComponentId
  map_break: IntermissionNextMapBreakComponentId
  series_end: IntermissionNextSeriesEndComponentId
  standby: IntermissionNextStandbyComponentId
}

export type IntermissionNextPageComponentId<PageId extends IntermissionNextPageId> =
  IntermissionNextPageComponentIdMap[PageId]

export type IntermissionNextPageComponentLayouts<PageId extends IntermissionNextPageId> = Partial<{
  [ComponentId in IntermissionNextPageComponentId<PageId>]: IntermissionNextComponentLayout
}>

export type IntermissionNextPageComponentWindows<PageId extends IntermissionNextPageId> = Partial<{
  [ComponentId in IntermissionNextPageComponentId<PageId>]: IntermissionNextComponentWindow[]
}>

export interface IntermissionNextPageLayout<PageId extends IntermissionNextPageId> {
  pageId: PageId
  components: IntermissionNextPageComponentLayouts<PageId>
  componentWindows: IntermissionNextPageComponentWindows<PageId>
  transitions: IntermissionNextTransitionComponent[]
}

export interface IntermissionNextLayoutState {
  version: typeof INTERMISSION_NEXT_LAYOUT_VERSION
  pages: {
    warmup: IntermissionNextPageLayout<'warmup'>
    bp: IntermissionNextPageLayout<'bp'>
    map_break: IntermissionNextPageLayout<'map_break'>
    series_end: IntermissionNextPageLayout<'series_end'>
    standby: IntermissionNextPageLayout<'standby'>
  }
}

export function isIntermissionNextPageId(value: unknown): value is IntermissionNextPageId {
  return (
    typeof value === 'string' &&
    INTERMISSION_NEXT_PAGE_IDS.includes(value as IntermissionNextPageId)
  )
}

export function isIntermissionNextResizeHandle(
  value: unknown
): value is IntermissionNextResizeHandle {
  return (
    typeof value === 'string' &&
    INTERMISSION_NEXT_RESIZE_HANDLES.includes(value as IntermissionNextResizeHandle)
  )
}

export function getIntermissionNextComponentDefinitions<PageId extends IntermissionNextPageId>(
  pageId: PageId
): readonly IntermissionNextComponentDefinition<IntermissionNextPageComponentId<PageId>>[] {
  return INTERMISSION_NEXT_PAGE_COMPONENT_DEFINITIONS[
    pageId
  ] as readonly IntermissionNextComponentDefinition<IntermissionNextPageComponentId<PageId>>[]
}

export function getIntermissionNextComponentDefinition<PageId extends IntermissionNextPageId>(
  pageId: PageId,
  componentId: string
): IntermissionNextComponentDefinition<IntermissionNextPageComponentId<PageId>> | undefined {
  return getIntermissionNextComponentDefinitions(pageId).find(
    (definition) => definition.id === componentId
  )
}
