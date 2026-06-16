import type { Point, Profile, Segment } from './types';

export const snapAngles = [0, 45, 90, 135, 180, 225, 270, 315];

export function distance(a: Point, b: Point) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function angleBetween(a: Point, b: Point) {
  return normalizeAngle((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI);
}

export function normalizeAngle(angle: number) {
  return ((angle % 360) + 360) % 360;
}

export function snapAngle(angle: number) {
  return snapAngles.reduce((closest, candidate) => {
    const currentDelta = Math.abs(shortestAngle(angle, closest));
    const candidateDelta = Math.abs(shortestAngle(angle, candidate));
    return candidateDelta < currentDelta ? candidate : closest;
  }, snapAngles[0]);
}

export function shortestAngle(a: number, b: number) {
  return ((((a - b) % 360) + 540) % 360) - 180;
}

export function pointFrom(start: Point, length: number, angle: number): Point {
  const radians = (angle * Math.PI) / 180;
  return {
    x: start.x + Math.cos(radians) * length,
    y: start.y + Math.sin(radians) * length,
  };
}

export function makeSegment(startPoint: Point, endPoint: Point, foldType: Segment['foldType'] = 'none'): Segment {
  return {
    id: crypto.randomUUID(),
    startPoint,
    endPoint,
    length: Math.round(distance(startPoint, endPoint)),
    angle: Math.round(angleBetween(startPoint, endPoint)),
    foldType,
  };
}

export function rebuildConnectedSegments(segments: Segment[], changedIndex: number, nextSegment: Segment) {
  const rebuilt = [...segments];
  rebuilt[changedIndex] = nextSegment;

  for (let index = changedIndex + 1; index < rebuilt.length; index += 1) {
    const previous = rebuilt[index - 1];
    const segment = rebuilt[index];
    const startPoint = previous.endPoint;
    rebuilt[index] = {
      ...segment,
      startPoint,
      endPoint: pointFrom(startPoint, segment.length, segment.angle),
    };
  }

  return rebuilt;
}

export function profileBounds(profile: Profile) {
  const points = profile.segments.flatMap((segment) => [segment.startPoint, segment.endPoint]);
  if (!points.length) {
    return { minX: -200, maxX: 200, minY: -150, maxY: 150, width: 400, height: 300 };
  }

  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  return { minX, maxX, minY, maxY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

export function segmentMidpoint(segment: Segment): Point {
  return {
    x: (segment.startPoint.x + segment.endPoint.x) / 2,
    y: (segment.startPoint.y + segment.endPoint.y) / 2,
  };
}

export function totalLength(profile: Profile) {
  return Math.round(profile.segments.reduce((sum, segment) => sum + segment.length, 0));
}
