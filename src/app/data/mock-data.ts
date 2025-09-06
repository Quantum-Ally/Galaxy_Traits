import { Observable, of, delay } from 'rxjs';
import { Node, NodeConfig, PhysicsConfig } from '../interfaces/node.interface';

export class MockDataService {
  private static readonly DEFAULT_PHYSICS_CONFIG: PhysicsConfig = {
    attractionK: 100,
    repulsionK: 20,
    damping: 0.98,
    maxDistance: 200,
    minDistance: 0.1
  };

  private static readonly DEFAULT_NODE_CONFIG: NodeConfig = {
    numNodes: 8, // Reduced from 10 to 8 for better performance
    numAttributes: 3,
    centralPreferences: [75, 25, 60], // More diverse central preferences
    selectedCentralNodeId: 'central'
  };

  private static readonly SAMPLE_NODES: Partial<Node>[] = [
    {
      id: 'biology',
      name: 'Programmable Biology',
      attributes: [85, 70, 60],
      color: '#C300FF'
    },
    {
      id: 'web3',
      name: 'Scenius Web3',
      attributes: [90, 80, 75],
      color: '#FF3366'
    },
    {
      id: 'computation',
      name: 'Breakthrough Computation',
      attributes: [95, 85, 90],
      color: '#00FFFF'
    },
    {
      id: 'about',
      name: 'About Blueyard',
      attributes: [60, 70, 80],
      color: '#0080FF'
    },
    {
      id: 'knowledge',
      name: 'Liberated Knowledge',
      attributes: [75, 85, 70],
      color: '#FF80FF'
    }
  ];

  // Generate diverse test configurations
  static generateDiverseTestConfig(): NodeConfig {
    const diversePreferences = [
      [90, 10, 80], // High, Low, High
      [20, 85, 15], // Low, High, Low  
      [50, 50, 50], // Balanced
      [95, 5, 95],  // Very High, Very Low, Very High
      [10, 90, 20], // Very Low, Very High, Low
      [70, 30, 60], // High-Medium, Low-Medium, High-Medium
    ];
    
    const randomPrefs = diversePreferences[Math.floor(Math.random() * diversePreferences.length)];
    
    return {
      numNodes: 8,
      numAttributes: 3,
      centralPreferences: randomPrefs,
      selectedCentralNodeId: 'central'
    };
  }

  static getPhysicsConfig(): Observable<PhysicsConfig> {
    return of({ ...this.DEFAULT_PHYSICS_CONFIG }).pipe(delay(1000));
  }

  static getNodeConfig(): Observable<NodeConfig> {
    return of({ ...this.DEFAULT_NODE_CONFIG }).pipe(delay(1000));
  }

  static getSampleNodes(): Observable<Partial<Node>[]> {
    return of([...this.SAMPLE_NODES]).pipe(delay(1000));
  }

  static generateRandomNodes(config: NodeConfig): Observable<Node[]> {
    const nodes: Node[] = [];
    const { numNodes, numAttributes, centralPreferences } = config;

    // Generate default attribute names
    const defaultAttributeNames = this.getAttributeNames(numAttributes);

    // Create central node as "sphere" (purple)
    const centralNode: Node = {
      id: 'sphere',
      name: 'Central Sphere',
      attributes: [...centralPreferences],
      attributeNames: [...defaultAttributeNames],
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      radius: 2,
      color: '#C300FF', // Neon purple
      isCentral: true,
      compatibility: 1
    };
    nodes.push(centralNode);

    // Create outer nodes as "sphere-clone" objects (pink-red)
    for (let i = 0; i < numNodes; i++) {
      const angle = (i / numNodes) * Math.PI * 2;
      const orbitRadius = 20 + Math.random() * 30;
      
      const attributes: number[] = [];
      for (let j = 0; j < numAttributes; j++) {
        // Create more diverse attribute distributions for better variety
        const distributionType = Math.random();
        let value: number;
        
        if (distributionType < 0.2) {
          // 20% chance: Low values (0-30)
          value = Math.random() * 30;
        } else if (distributionType < 0.4) {
          // 20% chance: High values (70-100)
          value = 70 + Math.random() * 30;
        } else if (distributionType < 0.6) {
          // 20% chance: Medium-low values (30-50)
          value = 30 + Math.random() * 20;
        } else if (distributionType < 0.8) {
          // 20% chance: Medium-high values (50-70)
          value = 50 + Math.random() * 20;
        } else {
          // 20% chance: Extreme values (very low or very high)
          value = Math.random() < 0.5 ? Math.random() * 15 : 85 + Math.random() * 15;
        }
        
        attributes.push(Math.max(0, Math.min(100, Math.floor(value))));
      }

      // Calculate initial compatibility with central node
      const compatibility = this.calculateCompatibility(centralPreferences, attributes);

      const node: Node = {
        id: `sphere-clone-${i}`,
        name: `Sphere Clone ${i + 1}`,
        attributes,
        attributeNames: [...defaultAttributeNames],
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
        color: '#FF3366', // Fixed pink-red color for outer nodes
        isCentral: false,
        compatibility
      };
      nodes.push(node);
    }

    return of(nodes).pipe(delay(1000));
  }

  private static calculateCompatibility(centralPrefs: number[], nodeAttrs: number[]): number {
    const len = Math.min(centralPrefs.length, nodeAttrs.length);
    const maxDiff = len * 100;
    let sum = 0;
    for (let i = 0; i < len; i++) {
      sum += Math.abs(centralPrefs[i] - nodeAttrs[i]);
    }
    return Math.max(0, 1 - sum / maxDiff);
  }


  static getAttributeNames(numAttributes: number): string[] {
    const allNames = [
      'Intelligence', 'Creativity', 'Empathy', 'Leadership', 'Technical',
      'Communication', 'Problem Solving', 'Innovation', 'Collaboration', 'Adaptability'
    ];
    return allNames.slice(0, numAttributes);
  }

  static getNodeDescriptions(): { [key: string]: string } {
    return {
      'biology': 'Advanced biological systems and synthetic biology research',
      'web3': 'Decentralized technologies and blockchain innovation',
      'computation': 'Quantum computing and advanced engineering solutions',
      'about': 'Information about Blueyard and our mission',
      'knowledge': 'Open data and knowledge sharing initiatives'
    };
  }

  static getPerformanceMetrics(): Observable<{
    fps: number;
    nodeCount: number;
    memoryUsage: number;
    renderTime: number;
  }> {
    return of({
      fps: 60,
      nodeCount: 20,
      memoryUsage: 45.2,
      renderTime: 16.7
    }).pipe(delay(1000));
  }
}
