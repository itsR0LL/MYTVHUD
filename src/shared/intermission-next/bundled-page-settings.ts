import type { BroadcastPageFlowTemplatesV3 } from '../broadcast-page-flow-next/page-flow'
import type { IntermissionNextLayoutState } from './contracts'

export interface BundledIntermissionPageSettings {
  intermissionNextLayoutV2: IntermissionNextLayoutState
  broadcastPageFlowTemplatesV3: BroadcastPageFlowTemplatesV3
}

export function createBundledIntermissionNextLayoutState(): IntermissionNextLayoutState {
  return {
    version: 4,
    pages: {
      warmup: {
        pageId: 'warmup',
        components: {
          eventBrand: {
            x: 60,
            y: 60,
            width: 960,
            height: 220,
            aspectRatioLocked: false
          },
          warmupPrompt: {
            x: 310,
            y: 421.616,
            width: 1300,
            height: 220,
            aspectRatioLocked: false
          },
          eventMark: {
            x: 1580,
            y: 15,
            width: 340,
            height: 90,
            aspectRatioLocked: false
          }
        },
        componentWindows: {
          eventBrand: [{ id: 'eventBrand-window-1', startOffsetMs: 0, endOffsetMs: null }],
          warmupPrompt: [{ id: 'warmupPrompt-window-1', startOffsetMs: 0, endOffsetMs: null }],
          eventMark: [{ id: 'eventMark-window-1', startOffsetMs: 0, endOffsetMs: null }]
        },
        transitions: []
      },
      bp: {
        pageId: 'bp',
        components: {
          bpCore: {
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
            aspectRatioLocked: true
          },
          eventMark: {
            x: 1580,
            y: 0,
            width: 340,
            height: 90,
            aspectRatioLocked: false
          }
        },
        componentWindows: {
          bpCore: [{ id: 'bpCore-window-1', startOffsetMs: 0, endOffsetMs: null }],
          eventMark: [{ id: 'eventMark-window-1', startOffsetMs: 0, endOffsetMs: null }]
        },
        transitions: []
      },
      map_break: {
        pageId: 'map_break',
        components: {
          utilityReplay: {
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
            aspectRatioLocked: true
          },
          mapReport: {
            x: 180,
            y: 217.248,
            width: 1560,
            height: 820,
            aspectRatioLocked: false
          },
          nextMap: {
            x: 480,
            y: 365.901,
            width: 960,
            height: 300,
            aspectRatioLocked: false
          },
          breakTimer: {
            x: 180,
            y: 75,
            width: 530.937,
            height: 142.248,
            aspectRatioLocked: false
          },
          eventMark: {
            x: 1520,
            y: 60,
            width: 340,
            height: 90,
            aspectRatioLocked: false
          }
        },
        componentWindows: {
          utilityReplay: [{ id: 'utilityReplay-window-1', startOffsetMs: 0, endOffsetMs: 120000 }],
          mapReport: [{ id: 'mapReport-window-1', startOffsetMs: 122892, endOffsetMs: 420000 }],
          nextMap: [{ id: 'nextMap-window-1', startOffsetMs: 421200, endOffsetMs: null }],
          breakTimer: [{ id: 'breakTimer-window-1', startOffsetMs: 421200, endOffsetMs: null }],
          eventMark: [{ id: 'eventMark-window-1', startOffsetMs: 122700, endOffsetMs: null }]
        },
        transitions: [
          { id: 'transition-1', startOffsetMs: 120180, durationMs: 1400 },
          { id: 'transition-2', startOffsetMs: 420000, durationMs: 1400 }
        ]
      },
      series_end: {
        pageId: 'series_end',
        components: {
          utilityReplay: {
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
            aspectRatioLocked: true
          },
          winner: {
            x: 60,
            y: 60,
            width: 1800,
            height: 280,
            aspectRatioLocked: false
          },
          finalScore: {
            x: 660.001,
            y: 133.325,
            width: 600,
            height: 150,
            aspectRatioLocked: false
          },
          mapHistory: {
            x: 132.067,
            y: 404.637,
            width: 1655.867,
            height: 420,
            aspectRatioLocked: false
          },
          seriesPlayerStats: {
            x: 50.304,
            y: 404.637,
            width: 1800,
            height: 500,
            aspectRatioLocked: false
          },
          eventMark: {
            x: 1600,
            y: 20,
            width: 320,
            height: 80,
            aspectRatioLocked: false
          }
        },
        componentWindows: {
          utilityReplay: [{ id: 'utilityReplay-window-1', startOffsetMs: 0, endOffsetMs: 120000 }],
          winner: [{ id: 'winner-window-1', startOffsetMs: 121200, endOffsetMs: 420000 }],
          finalScore: [{ id: 'finalScore-window-1', startOffsetMs: 428340, endOffsetMs: null }],
          mapHistory: [{ id: 'mapHistory-window-1', startOffsetMs: 121200, endOffsetMs: 420000 }],
          seriesPlayerStats: [
            { id: 'seriesPlayerStats-window-1', startOffsetMs: 431024, endOffsetMs: null }
          ],
          eventMark: [{ id: 'eventMark-window-1', startOffsetMs: 428313, endOffsetMs: null }]
        },
        transitions: [
          { id: 'transition-1', startOffsetMs: 120000, durationMs: 1400 },
          { id: 'transition-2', startOffsetMs: 420000, durationMs: 1400 }
        ]
      },
      standby: {
        pageId: 'standby',
        components: {
          previousSeriesResult: {
            x: 410,
            y: 0,
            width: 1100,
            height: 389.684,
            aspectRatioLocked: false
          },
          startCountdown: {
            x: 1180,
            y: 840,
            width: 680,
            height: 180,
            aspectRatioLocked: false
          },
          standbyPrompt: {
            x: 60,
            y: 491.991,
            width: 894.145,
            height: 360,
            aspectRatioLocked: false
          },
          eventMark: {
            x: 1560,
            y: 0,
            width: 360,
            height: 96,
            aspectRatioLocked: false
          }
        },
        componentWindows: {
          previousSeriesResult: [
            { id: 'previousSeriesResult-window-1', startOffsetMs: 0, endOffsetMs: null }
          ],
          startCountdown: [{ id: 'startCountdown-window-1', startOffsetMs: 0, endOffsetMs: null }],
          standbyPrompt: [{ id: 'standbyPrompt-window-1', startOffsetMs: 0, endOffsetMs: null }],
          eventMark: [{ id: 'eventMark-window-1', startOffsetMs: 0, endOffsetMs: null }]
        },
        transitions: []
      }
    }
  }
}

export function createBundledBroadcastPageFlowTemplates(): BroadcastPageFlowTemplatesV3 {
  return {
    version: 3,
    order: ['map_break', 'series_end', 'standby'],
    templates: {
      map_break: {
        type: 'map_break',
        pageId: 'map_break',
        enabled: true,
        defaultTotalDurationMs: 900000
      },
      series_end: {
        type: 'series_end',
        pageId: 'series_end',
        enabled: true,
        defaultTotalDurationMs: 1800000
      },
      standby: {
        type: 'standby',
        pageId: 'standby',
        enabled: true,
        defaultTotalDurationMs: 3600000
      }
    }
  }
}

export function createBundledIntermissionPageSettings(): BundledIntermissionPageSettings {
  return {
    intermissionNextLayoutV2: createBundledIntermissionNextLayoutState(),
    broadcastPageFlowTemplatesV3: createBundledBroadcastPageFlowTemplates()
  }
}
