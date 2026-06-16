import { makeSegment, pointFrom } from './geometry';
import type { Profile } from './types';

type TemplateStep = [length: number, angle: number];

const templateSteps: Record<string, TemplateStep[]> = {
  'Barge Flashing': [
    [25, 135],
    [200, 0],
    [100, 90],
    [15, 45],
    [10, 135],
  ],
  'Apron Flashing': [
    [30, 180],
    [160, 0],
    [85, 90],
  ],
  'Valley Gutter': [
    [80, 180],
    [120, 45],
    [120, 135],
    [80, 0],
  ],
  'Box Gutter': [
    [40, 180],
    [90, 90],
    [220, 0],
    [90, -90],
    [40, 0],
  ],
  'Corner Flashing': [
    [90, 180],
    [90, 90],
  ],
  'Parapet Capping': [
    [35, 180],
    [80, 90],
    [240, 0],
    [80, -90],
    [35, 0],
  ],
  'Ridge Capping': [
    [160, 160],
    [160, 20],
  ],
};

export const templateNames = Object.keys(templateSteps);

export function createProfile(name = 'Barge Flashing'): Profile {
  const steps = templateSteps[name] ?? templateSteps['Barge Flashing'];
  let startPoint = { x: -120, y: -40 };
  const segments = steps.map(([length, angle]) => {
    const endPoint = pointFrom(startPoint, length, angle);
    const segment = makeSegment(startPoint, endPoint);
    startPoint = endPoint;
    return { ...segment, length, angle: ((angle % 360) + 360) % 360 };
  });

  return {
    id: crypto.randomUUID(),
    name,
    segments,
    material: 'Colorbond',
    thickness: 0.55,
    notes: '',
  };
}
