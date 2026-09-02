import { describe, expect, it } from 'vitest'

import { rotationToPutCornerAtBottomRight, wrapRotation } from './drawing-orientation'

describe('wrapRotation', () => {
  it('normalizes to 0/90/180/270', () => {
    expect(wrapRotation(0)).toBe(0)
    expect(wrapRotation(90)).toBe(90)
    expect(wrapRotation(180)).toBe(180)
    expect(wrapRotation(270)).toBe(270)
    expect(wrapRotation(360)).toBe(0)
    expect(wrapRotation(-90)).toBe(270)
    expect(wrapRotation(450)).toBe(90)
  })
})

describe('rotationToPutCornerAtBottomRight', () => {
  it('turns the title-block corner to bottom-right', () => {
    expect(rotationToPutCornerAtBottomRight('br')).toBe(0)
    expect(rotationToPutCornerAtBottomRight('tr')).toBe(90)
    expect(rotationToPutCornerAtBottomRight('tl')).toBe(180)
    expect(rotationToPutCornerAtBottomRight('bl')).toBe(270)
  })
})
