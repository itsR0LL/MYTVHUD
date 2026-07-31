import {
  INTERMISSION_NEXT_PREVIEW_MESSAGE,
  type IntermissionNextOutputPayloadV1,
  type IntermissionNextPreviewMessageV1
} from '../../../../shared/intermission-output-next/output'

export function createIntermissionNextPreviewMessage(
  payload: IntermissionNextOutputPayloadV1
): IntermissionNextPreviewMessageV1 {
  const serialized = JSON.stringify(payload)
  if (typeof serialized !== 'string') {
    throw new Error('赛间预览载荷无法序列化')
  }
  return {
    type: INTERMISSION_NEXT_PREVIEW_MESSAGE,
    payload: JSON.parse(serialized) as IntermissionNextOutputPayloadV1
  }
}
