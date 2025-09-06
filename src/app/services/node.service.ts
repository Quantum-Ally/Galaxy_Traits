import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of, delay } from 'rxjs';
import { Node, NodeConfig, NodeUpdate, TooltipData } from '../interfaces/node.interface';

@Injectable({
  providedIn: 'root'
})
export class NodeService {
  public nodesSubject = new BehaviorSubject<Node[]>([]);
  public centralNodeSubject = new BehaviorSubject<Node | null>(null);
  public tooltipSubject = new BehaviorSubject<TooltipData>({
    visible: false,
    x: 0,
    y: 0,
    title: '',
    content: ''
  });

  public nodes$ = this.nodesSubject.asObservable();
  public centralNode$ = this.centralNodeSubject.asObservable();
  public tooltip$ = this.tooltipSubject.asObservable();

  constructor() {}

  generateNodes(config: NodeConfig): Observable<Node[]> {
    const nodes: Node[] = [];
    const { numNodes, numAttributes, centralPreferences } = config;

    // Create central node
    const centralNode: Node = {
      id: 'central',
      name: 'Central Node',
      attributes: [...centralPreferences],
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      radius: 2,
      color: '#C300FF',
      isCentral: true,
      compatibility: 1
    };
    nodes.push(centralNode);

    // Create outer nodes
    for (let i = 0; i < numNodes; i++) {
      const angle = (i / numNodes) * Math.PI * 2;
      const orbitRadius = 20 + Math.random() * 30;
      
      const attributes: number[] = [];
      for (let j = 0; j < numAttributes; j++) {
        attributes.push(Math.floor(Math.random() * 101));
      }

      const node: Node = {
        id: `node-${i}`,
        name: `Node ${i + 1}`,
        attributes,
        position: {
          x: Math.cos(angle) * orbitRadius,
          y: (Math.random() - 0.5) * 10,
          z: Math.sin(angle) * orbitRadius
        },
        velocity: {
          x: -Math.sin(angle) * 2,
          y: 0,
          z: Math.cos(angle) * 2
        },
        radius: 0.6 + Math.random() * 0.4,
        color: '#FF3366',
        isCentral: false
      };
      nodes.push(node);
    }

    this.nodesSubject.next(nodes);
    this.centralNodeSubject.next(centralNode);
    
    return of(nodes).pipe(delay(1000)); // Simulate async operation
  }

  updateNode(nodeId: string, updates: Partial<Node>): void {
    const nodes = this.nodesSubject.value;
    const nodeIndex = nodes.findIndex(n => n.id === nodeId);
    
    if (nodeIndex !== -1) {
      const updatedNode = { ...nodes[nodeIndex], ...updates };
      nodes[nodeIndex] = updatedNode;
      this.nodesSubject.next([...nodes]);
      
      if (updatedNode.isCentral) {
        this.centralNodeSubject.next(updatedNode);
      }
    }
  }

  setCentralNode(nodeId: string): void {
    const nodes = this.nodesSubject.value;
    const node = nodes.find(n => n.id === nodeId);
    
    if (node) {
      // Update all nodes to mark only the selected one as central
      const updatedNodes = nodes.map(n => ({
        ...n,
        isCentral: n.id === nodeId
      }));
      
      this.nodesSubject.next(updatedNodes);
      this.centralNodeSubject.next(node);
    }
  }

  updateNodeAttributes(nodeId: string, attributes: number[]): void {
    this.updateNode(nodeId, { attributes });
  }

  updateNodePosition(nodeId: string, position: { x: number; y: number; z: number }): void {
    this.updateNode(nodeId, { position });
  }

  updateNodeVelocity(nodeId: string, velocity: { x: number; y: number; z: number }): void {
    this.updateNode(nodeId, { velocity });
  }

  getNode(nodeId: string): Node | undefined {
    return this.nodesSubject.value.find(n => n.id === nodeId);
  }

  getCentralNode(): Node | null {
    return this.centralNodeSubject.value;
  }

  getOuterNodes(): Node[] {
    return this.nodesSubject.value.filter(n => !n.isCentral);
  }

  showTooltip(x: number, y: number, title: string, content: string, nodeId?: string): void {
    this.tooltipSubject.next({
      visible: true,
      x,
      y,
      title,
      content,
      nodeId
    });
  }

  hideTooltip(): void {
    this.tooltipSubject.next({
      visible: false,
      x: 0,
      y: 0,
      title: '',
      content: ''
    });
  }

  calculateCompatibility(centralPrefs: number[], nodeAttrs: number[]): number {
    const len = Math.min(centralPrefs.length, nodeAttrs.length);
    const maxDiff = len * 100;
    let sum = 0;
    for (let i = 0; i < len; i++) {
      sum += Math.abs(centralPrefs[i] - nodeAttrs[i]);
    }
    return Math.max(0, 1 - sum / maxDiff);
  }

  updateCompatibility(nodeId: string, centralPrefs: number[]): void {
    const node = this.getNode(nodeId);
    if (node && !node.isCentral) {
      const compatibility = this.calculateCompatibility(centralPrefs, node.attributes);
      this.updateNode(nodeId, { compatibility });
    }
  }

  updateAllCompatibilities(centralPrefs: number[]): void {
    const nodes = this.nodesSubject.value;
    const updatedNodes = nodes.map(node => {
      if (!node.isCentral) {
        const compatibility = this.calculateCompatibility(centralPrefs, node.attributes);
        return { ...node, compatibility };
      }
      return node;
    });
    this.nodesSubject.next(updatedNodes);
  }
}
