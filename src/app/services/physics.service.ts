import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Node, PhysicsConfig, ForceVector } from '../interfaces/node.interface';

@Injectable({
  providedIn: 'root'
})
export class PhysicsService {
  private physicsConfigSubject = new BehaviorSubject<PhysicsConfig>({
    attractionK: 100,
    repulsionK: 20,
    damping: 0.98,
    maxDistance: 200,
    minDistance: 0.1
  });

  public physicsConfig$ = this.physicsConfigSubject.asObservable();

  constructor() {}

  updatePhysicsConfig(config: Partial<PhysicsConfig>): void {
    const currentConfig = this.physicsConfigSubject.value;
    this.physicsConfigSubject.next({ ...currentConfig, ...config });
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

  calculateSimilarity(attrs1: number[], attrs2: number[]): number {
    const len = Math.min(attrs1.length, attrs2.length);
    const maxDiff = len * 100;
    let sum = 0;
    for (let i = 0; i < len; i++) {
      sum += Math.abs(attrs1[i] - attrs2[i]);
    }
    return Math.max(0, 1 - sum / maxDiff);
  }

  calculateAttractionForce(
    centralNode: Node,
    outerNode: Node,
    dt: number
  ): ForceVector {
    const config = this.physicsConfigSubject.value;
    const compatibility = this.calculateCompatibility(centralNode.attributes, outerNode.attributes);
    
    const dx = centralNode.position.x - outerNode.position.x;
    const dy = centralNode.position.y - outerNode.position.y;
    const dz = centralNode.position.z - outerNode.position.z;
    
    const distance = Math.max(Math.sqrt(dx * dx + dy * dy + dz * dz), config.minDistance);
    const distanceSquared = distance * distance;
    
    const forceMagnitude = (config.attractionK * compatibility) / distanceSquared;
    
    return {
      x: (dx / distance) * forceMagnitude * dt,
      y: (dy / distance) * forceMagnitude * dt,
      z: (dz / distance) * forceMagnitude * dt
    };
  }

  calculateRepulsionForce(
    node1: Node,
    node2: Node,
    dt: number
  ): { force1: ForceVector; force2: ForceVector } {
    const config = this.physicsConfigSubject.value;
    const similarity = this.calculateSimilarity(node1.attributes, node2.attributes);
    
    const dx = node2.position.x - node1.position.x;
    const dy = node2.position.y - node1.position.y;
    const dz = node2.position.z - node1.position.z;
    
    const distance = Math.max(Math.sqrt(dx * dx + dy * dy + dz * dz), config.minDistance);
    const distanceSquared = distance * distance;
    
    const forceMagnitude = (config.repulsionK * (1 - similarity)) / distanceSquared;
    
    const force = {
      x: (dx / distance) * forceMagnitude * dt,
      y: (dy / distance) * forceMagnitude * dt,
      z: (dz / distance) * forceMagnitude * dt
    };
    
    return {
      force1: { x: -force.x, y: -force.y, z: -force.z },
      force2: force
    };
  }

  applyDamping(velocity: ForceVector, damping: number): ForceVector {
    return {
      x: velocity.x * damping,
      y: velocity.y * damping,
      z: velocity.z * damping
    };
  }

  updateNodePosition(node: Node, velocity: ForceVector, dt: number): Node {
    return {
      ...node,
      position: {
        x: node.position.x + velocity.x * dt,
        y: node.position.y + velocity.y * dt,
        z: node.position.z + velocity.z * dt
      }
    };
  }

  calculateMultiDimensionalForces(centralPrefs: number[], nodeAttrs: number[]): ForceVector {
    const force: ForceVector = { x: 0, y: 0, z: 0 };
    const len = Math.min(centralPrefs.length, nodeAttrs.length);
    
    for (let i = 0; i < len; i++) {
      const diff = centralPrefs[i] - nodeAttrs[i];
      const normalizedDiff = diff / 100; // Normalize to -1 to 1
      
      // Map to 3D space: distribute attributes across dimensions
      const dimension = i % 3;
      if (dimension === 0) force.x += normalizedDiff;
      else if (dimension === 1) force.y += normalizedDiff;
      else force.z += normalizedDiff;
    }
    
    // Normalize the force vector
    const magnitude = Math.sqrt(force.x * force.x + force.y * force.y + force.z * force.z);
    if (magnitude > 0) {
      force.x /= magnitude;
      force.y /= magnitude;
      force.z /= magnitude;
    }
    
    return force;
  }
}

