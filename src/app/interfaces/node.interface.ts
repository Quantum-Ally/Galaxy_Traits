export interface Node {
  id: string;
  name: string;
  attributes: number[];
  attributeNames?: string[]; // Dynamic attribute names
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  radius: number;
  color: string;
  isCentral: boolean;
  compatibility?: number;
}

export interface PhysicsConfig {
  attractionK: number;
  repulsionK: number;
  damping: number;
  maxDistance: number;
  minDistance: number;
}

export interface NodeConfig {
  numNodes: number;
  numAttributes: number;
  centralPreferences: number[];
  selectedCentralNodeId: string;
}

export interface TooltipData {
  visible: boolean;
  x: number;
  y: number;
  title: string;
  content: string;
  nodeId?: string;
}

export interface ForceVector {
  x: number;
  y: number;
  z: number;
}

export interface NodeUpdate {
  nodeId: string;
  attributes?: number[];
  attributeNames?: string[];
  position?: { x: number; y: number; z: number };
  isCentral?: boolean;
}

export interface AttributeConfig {
  names: string[];
  values: number[];
}

export interface AttributeChange {
  type: 'add' | 'remove' | 'rename' | 'reorder';
  attributeIndex?: number;
  oldName?: string;
  newName?: string;
  defaultValue?: number;
}

