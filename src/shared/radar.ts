import type { BPMapId } from './bp'

export type RadarCoordinate = [x: number, y: number]

interface RadarTransform {
  origin: RadarCoordinate
  pxPerUX: number
  pxPerUY: number
}

interface SingleLevelRadarMap {
  assetPath: string
  transform: RadarTransform
}

interface MultiLevelRadarMap {
  assetPath: string
  levels: Array<{
    id: 'high' | 'low'
    transform: RadarTransform
    isVisible: (height: number) => boolean
  }>
}

type RadarMapConfig = SingleLevelRadarMap | MultiLevelRadarMap

export const RADAR_MAP_CONFIGS: Record<BPMapId, RadarMapConfig> = {
  de_mirage: {
    assetPath: '/overlay/assets/radar-Kq90y700.png',
    transform: {
      origin: [645.7196725473384, 340.2921393569175],
      pxPerUX: 0.20118507589946494,
      pxPerUY: -0.20138282875746794
    }
  },
  de_cache: {
    assetPath: '/overlay/assets/radar-SGBaU9po.png',
    transform: {
      origin: [361.7243823603619, 579.553558767951],
      pxPerUX: 0.1830927328891829,
      pxPerUY: -0.17650705879909936
    }
  },
  de_inferno: {
    assetPath: '/overlay/assets/radar-DBSzv8jC.png',
    transform: {
      origin: [426.51386123945593, 790.7266981544722],
      pxPerUX: 0.2041685571162696,
      pxPerUY: -0.20465735943851654
    }
  },
  de_dust2: {
    assetPath: '/overlay/assets/radar-c7lkNYvL.png',
    transform: {
      origin: [563.1339320329055, 736.9535330430065],
      pxPerUX: 0.2278315639654376,
      pxPerUY: -0.22776482548619972
    }
  },
  de_train: {
    assetPath: '/overlay/assets/radar-CIW847Lr.png',
    transform: {
      origin: [527.365542903922, 511.81469648562296],
      pxPerUX: 0.21532584158170223,
      pxPerUY: -0.21299254526091588
    }
  },
  de_overpass: {
    assetPath: '/overlay/assets/radar-BXyfX9pw.png',
    transform: {
      origin: [927.3988878244819, 343.8221009185496],
      pxPerUX: 0.1923720959212443,
      pxPerUY: -0.19427507725530338
    }
  },
  de_nuke: {
    assetPath: '/overlay/assets/radar-CL5OltUR.png',
    levels: [
      {
        id: 'high',
        transform: {
          origin: [473.1284773048749, 165.7329003801045],
          pxPerUX: 0.14376095926926907,
          pxPerUY: -0.14736670935219626
        },
        isVisible: (height) => height >= -450
      },
      {
        id: 'low',
        transform: {
          origin: [473.66746071612374, 638.302101754172],
          pxPerUX: 0.1436068746398272,
          pxPerUY: -0.14533406508526941
        },
        isVisible: (height) => height < -450
      }
    ]
  },
  de_vertigo: {
    assetPath: '/overlay/assets/radar-Dx93s-9A.png',
    levels: [
      {
        id: 'high',
        transform: {
          origin: [784.4793452283254, 255.42597837029027],
          pxPerUX: 0.19856123172015677,
          pxPerUY: -0.19820052722907044
        },
        isVisible: (height) => height >= 11700
      },
      {
        id: 'low',
        transform: {
          origin: [780.5145858437052, 695.4259783702903],
          pxPerUX: 0.1989615567841087,
          pxPerUY: -0.19820052722907044
        },
        isVisible: (height) => height < 11700
      }
    ]
  },
  de_ancient: {
    assetPath: '/overlay/assets/radar-BYPSA622.png',
    transform: {
      origin: [583.2590342775677, 428.92222042149115],
      pxPerUX: 0.1983512056034216,
      pxPerUY: -0.20108163914549304
    }
  },
  de_anubis: {
    assetPath: '/overlay/assets/radar-BIN0e30d.png',
    transform: {
      origin: [536.3392873296655, 638.0789844851904],
      pxPerUX: 0.1907910426894958,
      pxPerUY: -0.18993888105312648
    }
  }
}

function roundedRadarCoordinate(value: number): number {
  return Number((Math.round(value / 0.02) * 0.02).toFixed(2))
}

export function radarAssetPathForMap(mapId: BPMapId): string {
  return RADAR_MAP_CONFIGS[mapId].assetPath
}

export function projectWorldPositionToRadar(
  mapId: BPMapId,
  position: readonly number[]
): RadarCoordinate | null {
  const worldX = Number(position[0])
  const worldY = Number(position[1])
  const worldZ = Number(position[2] ?? 0)
  if (!Number.isFinite(worldX) || !Number.isFinite(worldY) || !Number.isFinite(worldZ)) {
    return null
  }

  const map = RADAR_MAP_CONFIGS[mapId]
  const transform =
    'transform' in map
      ? map.transform
      : map.levels.find((level) => level.isVisible(worldZ))?.transform
  if (!transform) return null

  return [
    roundedRadarCoordinate(transform.origin[0] + worldX * transform.pxPerUX),
    roundedRadarCoordinate(transform.origin[1] + worldY * transform.pxPerUY)
  ]
}
