export type Point = {
  x: number;
  y: number;
};

export type FoldType = 'none' | 'safety-edge' | 'hem' | 'open';

export type Segment = {
  id: string;
  startPoint: Point;
  endPoint: Point;
  length: number;
  angle: number;
  foldType: FoldType;
};

export type Profile = {
  id: string;
  name: string;
  segments: Segment[];
  material: string;
  thickness: number;
  notes: string;
};

export type ToolMode = 'draw' | 'edit' | 'move' | 'delete';
