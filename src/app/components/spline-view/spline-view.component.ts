import { Component, ElementRef, OnDestroy, OnInit, AfterViewInit, ViewChild, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PhysicsService } from '../../services/physics.service';
import { NodeService } from '../../services/node.service';
import { MockDataService } from '../../data/mock-data';
import { Node, NodeConfig, PhysicsConfig, TooltipData } from '../../interfaces/node.interface';

@Component({
  selector: 'app-spline-view',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './spline-view.component.html',
  styleUrls: ['./spline-view.component.scss']
})
export class SplineViewComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('threeCanvas', { static: true }) threeCanvasRef!: ElementRef<HTMLCanvasElement>;
  
  // Configuration signals
  numAttributes = signal<number>(3);
  numNodes = signal<number>(8); // Reduced from 10 to 8 for better initial performance
  attractionK = signal<number>(100);
  repulsionK = signal<number>(20);
  damping = signal<number>(0.98);
  centralPreferences = signal<number[]>([75, 25, 60]); // More diverse default preferences

  // UI State
  showControls = signal<boolean>(true);
  audioEnabled = signal<boolean>(false);
  tooltip = signal<TooltipData>({
    visible: false,
    x: 0,
    y: 0,
    title: '',
    content: ''
  });

  // Node management
  selectedCentralNodeId = signal<string>('central');
  editingNodeId = signal<string | null>(null);
  editingAttributeIndex = signal<number>(-1);
  attributeNames = signal<string[]>(['Intelligence', 'Creativity', 'Empathy']);

  // Performance monitoring
  fps = signal<number>(60);
  performanceMetrics = signal<{fps: number, nodeCount: number, memoryUsage: number, renderTime: number}>({
    fps: 60,
    nodeCount: 0,
    memoryUsage: 0,
    renderTime: 0
  });

  // Three.js properties
  private scene?: THREE.Scene;
  private camera?: THREE.PerspectiveCamera;
  private renderer?: THREE.WebGLRenderer;
  private controls?: OrbitControls;
  private animationId?: number;
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private dragging = false;
  private dragged?: THREE.Object3D | null;

  private centralSphere?: THREE.Mesh;
  nodeSpheres: THREE.Mesh[] = [];
  private nodeAttributes: number[][] = [];
  private velocities: THREE.Vector3[] = [];
  private particleSystem?: THREE.Points;
  private particles: THREE.Vector3[] = [];
  public nodes: Node[] = [];
  public centralNode: Node | null = null;
  
  // Equilibrium positions for nodes (calculated once)
  private equilibriumPositions: THREE.Vector3[] = [];
  public isCalculatingEquilibrium = false;
  public centralNodeChangeInProgress = false;

  // Performance monitoring
  private frameCount = 0;
  private lastTime = 0;
  private fpsUpdateInterval = 0;

  constructor(
    private physicsService: PhysicsService,
    private nodeService: NodeService
  ) {}

  ngOnInit(): void {
    this.loadInitialData();
    this.setupSubscriptions();
  }

  ngAfterViewInit(): void {
    // Avoid SSR accessing DOM
    if (typeof window === 'undefined') return;
    this.initThree();
    this.createParticleSystem();
    this.resetNodes();
    this.start();
    this.startPerformanceMonitoring();
  }

  private loadInitialData(): void {
    // Load physics config
    MockDataService.getPhysicsConfig().subscribe(config => {
      this.physicsService.updatePhysicsConfig(config);
      this.attractionK.set(config.attractionK);
      this.repulsionK.set(config.repulsionK);
      this.damping.set(config.damping);
    });

    // Load node config
    MockDataService.getNodeConfig().subscribe(config => {
      this.numNodes.set(config.numNodes);
      this.numAttributes.set(config.numAttributes);
      this.centralPreferences.set(config.centralPreferences);
      this.selectedCentralNodeId.set(config.selectedCentralNodeId);
    });

    // Load attribute names
    this.attributeNames.set(MockDataService.getAttributeNames(this.numAttributes()));
  }

  private setupSubscriptions(): void {
    // Subscribe to tooltip updates
    this.nodeService.tooltip$.subscribe(tooltip => {
      this.tooltip.set(tooltip);
    });

    // Subscribe to node updates
    this.nodeService.nodes$.subscribe(nodes => {
      this.nodes = nodes;
      this.updateThreeJSFromNodes();
    });

    // Subscribe to central node updates
    this.nodeService.centralNode$.subscribe(centralNode => {
      this.centralNode = centralNode;
    });
  }

  ngOnDestroy(): void {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    if (this.fpsUpdateInterval) clearInterval(this.fpsUpdateInterval);
    this.controls?.dispose();
    this.renderer?.dispose();
  }

  private startPerformanceMonitoring(): void {
    // OPTIMIZED: Reduced frequency of performance monitoring
    this.fpsUpdateInterval = window.setInterval(() => {
      this.updatePerformanceMetrics();
    }, 2000); // Changed from 1000ms to 2000ms
  }

  private updatePerformanceMetrics(): void {
    const currentTime = performance.now();
    const deltaTime = currentTime - this.lastTime;
    const currentFps = Math.round(1000 / (deltaTime / this.frameCount));
    
    // OPTIMIZED: Only update if FPS changed significantly to reduce signal updates
    if (Math.abs(currentFps - this.fps()) > 5) {
      this.fps.set(currentFps);
    }
    
    this.performanceMetrics.set({
      fps: currentFps,
      nodeCount: this.nodes.length,
      memoryUsage: (performance as any).memory?.usedJSHeapSize / 1024 / 1024 || 0,
      renderTime: deltaTime / this.frameCount
    });
    
    this.frameCount = 0;
    this.lastTime = currentTime;
  }

  private updateThreeJSFromNodes(): void {
    if (!this.scene) return;

    console.log('Updating Three.js visualization with', this.nodes.length, 'nodes');

    // Clear existing spheres completely
    for (const sphere of this.nodeSpheres) {
      this.scene.remove(sphere);
      // Dispose of geometry and material to prevent memory leaks
      if (sphere.geometry) sphere.geometry.dispose();
      if (sphere.material) {
        if (Array.isArray(sphere.material)) {
          sphere.material.forEach(mat => mat.dispose());
        } else {
          sphere.material.dispose();
        }
      }
    }
    
    // Clear central sphere
    if (this.centralSphere) {
      this.scene.remove(this.centralSphere);
      if (this.centralSphere.geometry) this.centralSphere.geometry.dispose();
      if (this.centralSphere.material) {
        if (Array.isArray(this.centralSphere.material)) {
          this.centralSphere.material.forEach(mat => mat.dispose());
        } else {
          this.centralSphere.material.dispose();
        }
      }
    }

    // Reset arrays
    this.nodeSpheres = [];
    this.nodeAttributes = [];
    this.velocities = [];
    this.centralSphere = undefined;

    // Create spheres from nodes
    for (const node of this.nodes) {
      // Reduced geometry detail for better performance (16x16 instead of 32x32)
      const geometry = new THREE.SphereGeometry(node.radius, 16, 16);
      const material = new THREE.MeshStandardMaterial({
        color: node.color,
        emissive: node.color,
        emissiveIntensity: node.isCentral ? 0.7 : 0.5,
        metalness: 0.2,
        roughness: 0.3
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(node.position.x, node.position.y, node.position.z);
      (mesh as any).nodeId = node.id;
      (mesh as any).isNode = true;
      (mesh as any).isCentral = node.isCentral;

      this.scene.add(mesh);

      if (node.isCentral) {
        this.centralSphere = mesh;
        console.log('Central node set to:', node.id, 'at position:', node.position);
      }
      
      // Add all nodes to nodeSpheres for physics calculations and interactions
      this.nodeSpheres.push(mesh);
      this.nodeAttributes.push([...node.attributes]);
      this.velocities.push(new THREE.Vector3(node.velocity.x, node.velocity.y, node.velocity.z));
    }
    
    console.log('Three.js visualization updated. Central sphere:', this.centralSphere ? 'found' : 'not found');
  }

  private initThree(): void {
    const canvas = this.threeCanvasRef.nativeElement;
    // OPTIMIZED: Disabled antialiasing for better performance
    this.renderer = new THREE.WebGLRenderer({ 
      canvas, 
      antialias: false, // Disabled for performance
      alpha: true,
      powerPreference: "high-performance" // Use dedicated GPU if available
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // Reduced max pixel ratio
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

    this.scene = new THREE.Scene();
    this.scene.background = null as any;

    const fov = 60;
    const aspect = canvas.clientWidth / canvas.clientHeight;
    this.camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 2000);
    this.camera.position.set(0, 0, 120);

    const ambient = new THREE.AmbientLight(0x8888ff, 0.8);
    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(1, 1, 1);
    this.scene.add(ambient, dir);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;

    window.addEventListener('resize', () => this.onResize());
    canvas.addEventListener('mousemove', (e: MouseEvent) => this.onMouseMove(e));
    canvas.addEventListener('mousedown', (e: MouseEvent) => this.onMouseDown(e));
    canvas.addEventListener('mouseup', () => this.onMouseUp());
    canvas.addEventListener('mouseleave', () => this.onMouseUp());
  }

  private onResize(): void {
    if (!this.camera || !this.renderer) return;
    const canvas = this.threeCanvasRef.nativeElement;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  resetNodes(): void {
    const config: NodeConfig = {
      numNodes: this.numNodes(),
      numAttributes: this.numAttributes(),
      centralPreferences: this.centralPreferences(),
      selectedCentralNodeId: this.selectedCentralNodeId()
    };

    // Update attribute names
    this.attributeNames.set(MockDataService.getAttributeNames(config.numAttributes));

    // Generate new nodes using the service
    MockDataService.generateRandomNodes(config).subscribe(nodes => {
      this.nodeService.nodesSubject.next(nodes);
      this.nodeService.centralNodeSubject.next(nodes.find(n => n.isCentral) || null);
    });
  }

  onNumNodesChange(value: number): void {
    this.numNodes.set(Number(value) || 0);
    this.resetNodes();
    // Clear equilibrium positions to trigger recalculation
    this.equilibriumPositions = [];
  }

  onNumAttributesChange(value: number): void {
    const len = Math.max(3, Math.min(10, Number(value) || 3));
    this.numAttributes.set(len);
    this.centralPreferences.set(Array.from({ length: len }, () => 50));
    this.resetNodes();
    // Clear equilibrium positions to trigger recalculation
    this.equilibriumPositions = [];
  }

  onCentralPrefsChange(csv: string): void {
    const parts = (csv || '')
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .map(s => {
        const n = Number(s);
        return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
      });
    if (parts.length === 0) return;
    this.centralPreferences.set(parts);
    // Clear equilibrium positions to trigger recalculation with new preferences
    this.equilibriumPositions = [];
  }

  onCentralNodeChange(nodeId: string): void {
    // Prevent selecting the same central node
    if (nodeId === this.selectedCentralNodeId()) {
      console.log('Same central node selected, no change needed');
      return;
    }
    
    // Prevent selecting non-existent nodes
    const node = this.nodes.find(n => n.id === nodeId);
    if (!node) {
      console.warn('Selected node not found:', nodeId);
      return;
    }
    
    console.log('Central node change requested:', nodeId);
    this.selectCentralNode(nodeId);
  }

  // UI Methods
  toggleControls(): void {
    this.showControls.set(!this.showControls());
  }

  toggleAudio(): void {
    this.audioEnabled.set(!this.audioEnabled());
  }

  selectNode(nodeId: string): void {
    const descriptions = MockDataService.getNodeDescriptions();
    const node = this.nodes.find(n => n.id === nodeId);
    if (node) {
      // Update central preferences based on selected node
      const newPrefs = Array.from({ length: this.numAttributes() }, () => Math.floor(Math.random() * 101));
      this.centralPreferences.set(newPrefs);
      
      // Visual feedback
      this.nodeService.showTooltip(0, 0, node.name, descriptions[nodeId] || node.name);
      setTimeout(() => this.nodeService.hideTooltip(), 3000);
    }
  }

  // Node management methods
  private resetSimulation(): void {
    console.log('Resetting simulation...');
    
    // Stop any ongoing calculations
    this.isCalculatingEquilibrium = false;
    
    // Clear equilibrium positions to force recalculation
    this.equilibriumPositions = [];
    
    // Reset velocities
    for (let i = 0; i < this.velocities.length; i++) {
      this.velocities[i].set(0, 0, 0);
    }
    
    // Update Three.js visualization with new node structure
    this.updateThreeJSFromNodes();
    
    console.log('Simulation reset complete - equilibrium will be recalculated');
  }

  selectCentralNode(nodeId: string): void {
    this.selectedCentralNodeId.set(nodeId);
    
    // Find the selected node
    const selectedNode = this.nodes.find(n => n.id === nodeId);
    if (!selectedNode) return;
    
    console.log('Changing central node to:', nodeId);
    
    // Show central node change indicator
    this.centralNodeChangeInProgress = true;
    
    // Stop any ongoing calculations to prevent hanging
    this.isCalculatingEquilibrium = false;
    
    // Clear existing equilibrium positions
    this.equilibriumPositions = [];
    
    // Create completely new node array with proper central node transition
    const updatedNodes = this.nodes.map(node => {
      if (node.id === nodeId) {
        // Make this node the new central node - preserve original name
        return {
          ...node,
          isCentral: true,
          color: '#C300FF', // Purple for central
          radius: 2, // Larger radius for central
          name: node.name, // Keep original name, don't change to "Central Sphere"
          position: { x: 0, y: 0, z: 0 }, // Move to center
          velocity: { x: 0, y: 0, z: 0 } // Stop movement
        };
      } else {
        // Convert all other nodes to outer nodes - preserve their original names
        const isOldCentral = node.isCentral;
        return {
          ...node,
          isCentral: false,
          color: '#FF3366', // Pink-red for outer nodes
          radius: 0.6 + Math.random() * 0.4, // Random radius for outer nodes
          // If this was the old central node, give it a new random position
          position: isOldCentral ? {
            x: (Math.random() - 0.5) * 100,
            y: (Math.random() - 0.5) * 20,
            z: (Math.random() - 0.5) * 100
          } : node.position, // Keep current position for other nodes
          velocity: { x: 0, y: 0, z: 0 } // Reset velocities
        };
      }
    });
    
    // Update the nodes in the service
    this.nodeService.nodesSubject.next(updatedNodes);
    this.nodeService.centralNodeSubject.next(updatedNodes.find(n => n.isCentral) || null);
    
    // Update central preferences to match the selected node
    this.centralPreferences.set([...selectedNode.attributes]);
    
    // Recalculate all compatibilities based on new central node
    this.nodeService.updateAllCompatibilities(selectedNode.attributes);
    
    // Reset the entire simulation
    this.resetSimulation();
    
    // Force equilibrium calculation after a short delay to ensure Three.js is updated
    setTimeout(() => {
      console.log('Triggering equilibrium calculation after central node change...');
      this.centralNodeChangeInProgress = false; // Hide central node change indicator
      this.equilibriumPositions = []; // Clear to force recalculation
      
      // Force a physics step to trigger equilibrium calculation
      if (this.centralNode && this.nodeSpheres.length > 0) {
        this.stepPhysics(0.016);
      }
    }, 100);
    
    console.log('Central node changed, simulation reset, will recalculate equilibrium positions...');
  }

  private resetOuterNodeVelocities(): void {
    // Reset velocities for all outer nodes to create new equilibrium
    for (let i = 0; i < this.velocities.length; i++) {
      const mesh = this.nodeSpheres[i];
      const nodeId = (mesh as any).nodeId;
      const node = this.nodes.find(n => n.id === nodeId);
      
      if (node && !node.isCentral) {
        // Reset velocity to allow new forces to take effect
        this.velocities[i].set(0, 0, 0);
        
        // Update velocity in service
        this.nodeService.updateNodeVelocity(nodeId, {
          x: 0,
          y: 0,
          z: 0
        });
      }
    }
  }

  startEditingNode(nodeId: string, attributeIndex: number): void {
    this.editingNodeId.set(nodeId);
    this.editingAttributeIndex.set(attributeIndex);
  }

  updateNodeAttribute(nodeId: string, attributeIndex: number, value: number): void {
    const node = this.nodes.find(n => n.id === nodeId);
    if (node) {
      const newAttributes = [...node.attributes];
      newAttributes[attributeIndex] = Math.max(0, Math.min(100, value));
      
      this.nodeService.updateNodeAttributes(nodeId, newAttributes);
      
      // If this is the central node, update preferences too
      if (nodeId === this.selectedCentralNodeId()) {
        this.centralPreferences.set([...newAttributes]);
        this.nodeService.updateAllCompatibilities(newAttributes);
      }
    }
  }

  stopEditingNode(): void {
    this.editingNodeId.set(null);
    this.editingAttributeIndex.set(-1);
  }

  getNodeAttributes(nodeId: string): number[] {
    const node = this.nodes.find(n => n.id === nodeId);
    return node ? node.attributes : [];
  }

  getCentralNodeAttributes(): number[] {
    return this.centralPreferences();
  }

  // Performance and stress testing
  runStressTest(): void {
    // Test with maximum nodes
    this.numNodes.set(20);
    this.resetNodes();
    
    // Monitor performance
    const startTime = performance.now();
    setTimeout(() => {
      const endTime = performance.now();
      const duration = endTime - startTime;
      console.log(`Stress test completed in ${duration}ms`);
      console.log(`Performance metrics:`, this.performanceMetrics());
    }, 5000);
  }

  // Debug method to force immediate movement to equilibrium
  forceMoveToEquilibrium(): void {
    console.log('Forcing immediate movement to equilibrium positions...');
    if (this.equilibriumPositions.length === 0) {
      console.log('No equilibrium positions calculated yet');
      return;
    }
    
    for (let i = 0; i < this.nodeSpheres.length; i++) {
      const mesh = this.nodeSpheres[i];
      const nodeId = (mesh as any).nodeId;
      const node = this.nodes.find(n => n.id === nodeId);
      const targetPosition = this.equilibriumPositions[i];
      
      if (targetPosition && node) {
        console.log(`Moving node ${nodeId} from`, mesh.position, 'to', targetPosition);
        mesh.position.copy(targetPosition);
        
        // Update service
        this.nodeService.updateNodePosition(nodeId, {
          x: mesh.position.x,
          y: mesh.position.y,
          z: mesh.position.z
        });
      }
    }
    console.log('Forced movement complete');
  }

  // Generate diverse test configuration
  generateDiverseTest(): void {
    console.log('Generating diverse test configuration...');
    const diverseConfig = MockDataService.generateDiverseTestConfig();
    
    // Update central preferences
    this.centralPreferences.set(diverseConfig.centralPreferences);
    
    // Reset nodes with new configuration
    this.resetNodes();
    
    // Clear equilibrium positions to force recalculation
    this.equilibriumPositions = [];
    
    console.log('Diverse test configuration generated:', diverseConfig.centralPreferences);
  }

  resetToDefaults(): void {
    this.numNodes.set(8);
    this.numAttributes.set(3);
    this.attractionK.set(100);
    this.repulsionK.set(20);
    this.damping.set(0.98);
    this.centralPreferences.set([75, 25, 60]); // More diverse default preferences
    this.resetNodes();
  }

  private createParticleSystem(): void {
    if (!this.scene) return;

    // Reduced particle count for better performance
    const particleCount = 200; // Reduced from 1000 to 200
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      
      const radius = 300 + Math.random() * 200;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      
      positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i3 + 2] = radius * Math.cos(phi);
      
      const distance = Math.sqrt(positions[i3] ** 2 + positions[i3 + 1] ** 2 + positions[i3 + 2] ** 2);
      const normalizedDistance = distance / 500;
      
      if (normalizedDistance < 0.3) {
        colors[i3] = 0.8;
        colors[i3 + 1] = 0.2;
        colors[i3 + 2] = 1.0;
      } else if (normalizedDistance < 0.6) {
        colors[i3] = 1.0;
        colors[i3 + 1] = 0.2;
        colors[i3 + 2] = 0.4;
      } else {
        colors[i3] = 0.0;
        colors[i3 + 1] = 1.0;
        colors[i3 + 2] = 1.0;
      }
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 3, // Slightly larger to compensate for fewer particles
      vertexColors: true,
      transparent: true,
      opacity: 0.6, // Reduced opacity for better performance
      blending: THREE.AdditiveBlending
    });

    this.particleSystem = new THREE.Points(geometry, material);
    this.scene.add(this.particleSystem);

    for (let i = 0; i < particleCount; i++) {
      this.particles.push(new THREE.Vector3(
        positions[i * 3],
        positions[i * 3 + 1],
        positions[i * 3 + 2]
      ));
    }
  }


  private stepPhysics(dt: number): void {
    if (!this.centralNode || this.nodeSpheres.length === 0) return;

    // Only calculate equilibrium positions when needed (startup or central node change)
    if (this.equilibriumPositions.length === 0 || this.isCalculatingEquilibrium) {
      console.log('Triggering equilibrium calculation - positions needed:', this.equilibriumPositions.length === 0, 'calculating:', this.isCalculatingEquilibrium);
      this.calculateEquilibriumPositions();
      return;
    }

    // Keep nodes at their equilibrium positions (no continuous movement)
    for (let i = 0; i < this.nodeSpheres.length; i++) {
      const mesh = this.nodeSpheres[i];
      const nodeId = (mesh as any).nodeId;
      const node = this.nodes.find(n => n.id === nodeId);
      
      // Skip only currently dragged nodes, but allow central node to move to new position
      if (this.dragging && this.dragged === mesh) continue;
      
      // Return to equilibrium position with smooth interpolation
      const targetPosition = this.equilibriumPositions[i];
      if (targetPosition) {
        const currentPos = mesh.position;
        const distance = currentPos.distanceTo(targetPosition);
        
        // If node is far from equilibrium, smoothly return it
        if (distance > 0.1) {
          const returnSpeed = 2.0; // Speed of return to equilibrium
          const direction = targetPosition.clone().sub(currentPos).normalize();
          const moveDistance = Math.min(distance, returnSpeed * dt);
          
          const oldPos = mesh.position.clone();
          mesh.position.add(direction.multiplyScalar(moveDistance));
          
          // Debug logging for movement
          if (Math.random() < 0.01) { // Log occasionally to avoid spam
            console.log(`Node ${nodeId} moving from`, oldPos, 'towards', targetPosition, 'distance:', distance);
          }
          
          // Update service with new position
          this.nodeService.updateNodePosition(nodeId, {
            x: mesh.position.x,
            y: mesh.position.y,
            z: mesh.position.z
          });
        }
      }
    }

    this.animateParticles(dt);
    this.frameCount++;
  }

  private calculateEquilibriumPositions(): void {
    if (!this.centralNode || this.nodeSpheres.length === 0) return;
    
    this.isCalculatingEquilibrium = true;
    console.log('Calculating equilibrium positions...');
    
    // Set a timeout to prevent hanging
    const timeoutId = setTimeout(() => {
      if (this.isCalculatingEquilibrium) {
        console.warn('Equilibrium calculation timed out, stopping...');
        this.isCalculatingEquilibrium = false;
      }
    }, 10000); // 10 second timeout
    
    // Run calculation asynchronously to avoid blocking UI
    setTimeout(() => {
      this.runEquilibriumCalculation();
      clearTimeout(timeoutId); // Clear timeout if calculation completes
    }, 0);
  }

  private runEquilibriumCalculation(): void {
    // Safety check to prevent excessive calculations
    if (this.nodeSpheres.length > 50) {
      console.warn('Too many nodes, skipping equilibrium calculation to prevent hanging');
      this.isCalculatingEquilibrium = false;
      return;
    }

    // Update physics service config
    this.physicsService.updatePhysicsConfig({
      attractionK: this.attractionK(),
      repulsionK: this.repulsionK(),
      damping: this.damping()
    });

    // Initialize equilibrium positions array
    this.equilibriumPositions = [];
    
    // Run physics simulation for a fixed number of steps to find equilibrium
    const simulationSteps = Math.min(200, 50 + this.nodeSpheres.length * 2); // Adaptive steps based on node count
    const dt = 0.016; // Fixed timestep (60fps)
    
    console.log(`Running equilibrium calculation with ${simulationSteps} steps for ${this.nodeSpheres.length} nodes`);
    
    // Initialize velocities to zero
    for (let i = 0; i < this.nodeSpheres.length; i++) {
      this.velocities[i] = new THREE.Vector3(0, 0, 0);
    }
    
    // Run physics simulation with progress tracking
    for (let step = 0; step < simulationSteps; step++) {
      // Check if calculation was cancelled
      if (!this.isCalculatingEquilibrium) {
        console.log('Equilibrium calculation cancelled');
        return;
      }
      // Calculate forces for each node (excluding central node)
      for (let i = 0; i < this.nodeSpheres.length; i++) {
        const mesh = this.nodeSpheres[i];
        const nodeId = (mesh as any).nodeId;
        const node = this.nodes.find(n => n.id === nodeId);
        
        if (!node || node.isCentral) continue;

        // Reset velocity for this step
        this.velocities[i].set(0, 0, 0);

        // Calculate attraction force from central node
        if (!this.centralNode) continue;
        const attractionForce = this.physicsService.calculateAttractionForce(
          this.centralNode,
          node,
          dt
        );

        // Apply attraction force
        this.velocities[i].add(new THREE.Vector3(
          attractionForce.x,
          attractionForce.y,
          attractionForce.z
        ));

        // Calculate repulsion forces from other nodes (excluding central)
        const maxRepulsionDistance = 50;
        for (let j = 0; j < this.nodeSpheres.length; j++) {
          if (i === j) continue;
          
          const otherMesh = this.nodeSpheres[j];
          const otherNodeId = (otherMesh as any).nodeId;
          const otherNode = this.nodes.find(n => n.id === otherNodeId);
          
          if (!otherNode || otherNode.isCentral) continue;

          // Quick distance check
          const dx = otherNode.position.x - node.position.x;
          const dy = otherNode.position.y - node.position.y;
          const dz = otherNode.position.z - node.position.z;
          const distanceSquared = dx * dx + dy * dy + dz * dz;
          
          if (distanceSquared > maxRepulsionDistance * maxRepulsionDistance) continue;

          const repulsionForces = this.physicsService.calculateRepulsionForce(node, otherNode, dt);
          
          // Apply repulsion force
          this.velocities[i].add(new THREE.Vector3(
            repulsionForces.force1.x,
            repulsionForces.force1.y,
            repulsionForces.force1.z
          ));
        }

        // Apply damping
        const dampedVelocity = this.physicsService.applyDamping(
          {
            x: this.velocities[i].x,
            y: this.velocities[i].y,
            z: this.velocities[i].z
          },
          this.damping()
        );

        this.velocities[i].set(dampedVelocity.x, dampedVelocity.y, dampedVelocity.z);
      }

      // Update positions (only for non-central nodes)
      for (let i = 0; i < this.nodeSpheres.length; i++) {
        const mesh = this.nodeSpheres[i];
        const nodeId = (mesh as any).nodeId;
        const node = this.nodes.find(n => n.id === nodeId);
        
        if (!node || node.isCentral) continue;
        
        // Update position
        mesh.position.addScaledVector(this.velocities[i], dt);
      }
      
      // Ensure central node stays at center
      for (let i = 0; i < this.nodeSpheres.length; i++) {
        const mesh = this.nodeSpheres[i];
        const nodeId = (mesh as any).nodeId;
        const node = this.nodes.find(n => n.id === nodeId);
        
        if (node && node.isCentral) {
          mesh.position.set(0, 0, 0);
        }
      }
    }
    
    // Store final positions as equilibrium positions
    for (let i = 0; i < this.nodeSpheres.length; i++) {
      const mesh = this.nodeSpheres[i];
      const nodeId = (mesh as any).nodeId;
      const node = this.nodes.find(n => n.id === nodeId);
      
      if (node) {
        if (node.isCentral) {
          // Central node should always be at center
          this.equilibriumPositions[i] = new THREE.Vector3(0, 0, 0);
        } else {
          // Outer nodes use their calculated positions
          this.equilibriumPositions[i] = mesh.position.clone();
        }
      }
    }
    
    // Update service with final positions
    for (let i = 0; i < this.nodeSpheres.length; i++) {
      const mesh = this.nodeSpheres[i];
      const nodeId = (mesh as any).nodeId;
      
      this.nodeService.updateNodePosition(nodeId, {
        x: mesh.position.x,
        y: mesh.position.y,
        z: mesh.position.z
      });
    }
    
    this.isCalculatingEquilibrium = false;
    console.log('Equilibrium positions calculated!');
    console.log('Equilibrium positions:', this.equilibriumPositions.map((pos, i) => ({
      index: i,
      position: pos ? { x: pos.x, y: pos.y, z: pos.z } : 'null',
      nodeId: this.nodeSpheres[i] ? (this.nodeSpheres[i] as any).nodeId : 'unknown'
    })));
  }

  private animateParticles(dt: number): void {
    if (!this.particleSystem) return;

    // OPTIMIZED: Only animate particles every few frames to reduce CPU load
    if (this.frameCount % 3 !== 0) return; // Skip 2 out of 3 frames

    const positions = this.particleSystem.geometry.attributes['position'].array as Float32Array;
    const time = performance.now() * 0.001;

    // OPTIMIZED: Reduce animation complexity
    for (let i = 0; i < this.particles.length; i++) {
      const i3 = i * 3;
      const particle = this.particles[i];
      
      // Simplified animation with reduced frequency
      particle.x += Math.sin(time * 0.5 + i * 0.02) * 0.05 * dt;
      particle.y += Math.cos(time * 0.5 + i * 0.02) * 0.05 * dt;
      particle.z += Math.sin(time * 0.3 + i * 0.01) * 0.03 * dt;
      
      positions[i3] = particle.x;
      positions[i3 + 1] = particle.y;
      positions[i3 + 2] = particle.z;
    }

    this.particleSystem.geometry.attributes['position'].needsUpdate = true;
  }

  private start(): void {
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      this.stepPhysics(dt);
      this.controls?.update();
      this.render();
      this.animationId = requestAnimationFrame(tick);
    };
    this.animationId = requestAnimationFrame(tick);
  }

  private render(): void {
    if (!this.renderer || !this.scene || !this.camera) return;
    this.renderer.render(this.scene, this.camera);
  }

  private onMouseMove(e: MouseEvent): void {
    const rect = this.threeCanvasRef.nativeElement.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    
    if (this.dragging && this.dragged && this.camera) {
      const depth = 200;
      const vector = new THREE.Vector3(this.mouse.x, this.mouse.y, 0.5).unproject(this.camera);
      const dir = vector.sub(this.camera.position).normalize();
      const pos = this.camera.position.clone().add(dir.multiplyScalar(depth));
      this.dragged.position.copy(pos);
      
      // Update node position in service and reset velocity for force recalculation
      const nodeId = (this.dragged as any).nodeId;
      if (nodeId) {
        this.nodeService.updateNodePosition(nodeId, {
          x: pos.x,
          y: pos.y,
          z: pos.z
        });
        
        // Reset velocity to trigger force recalculation
        const nodeIndex = this.nodeSpheres.indexOf(this.dragged as THREE.Mesh);
        if (nodeIndex !== -1) {
          this.velocities[nodeIndex].set(0, 0, 0);
        }
      }
    }

    const obj = this.intersectNode(e);
    if (obj && (obj as any).isNode) {
      const nodeId = (obj as any).nodeId;
      const node = this.nodes.find(n => n.id === nodeId);
      
      if (node) {
        const isCentral = node.isCentral;
        const compat = this.physicsService.calculateCompatibility(
          this.centralPreferences(),
          node.attributes
        );
        
        let tooltipContent = `Compatibility: ${(compat * 100).toFixed(1)}%\n\n`;
        tooltipContent += `Attributes:\n`;
        
        // Show attributes with names and visual indicators
        const attrNames = this.attributeNames();
        for (let i = 0; i < node.attributes.length; i++) {
          const name = attrNames[i] || `Attr ${i + 1}`;
          const value = node.attributes[i];
          const bar = '█'.repeat(Math.floor(value / 10)) + '░'.repeat(10 - Math.floor(value / 10));
          tooltipContent += `${name}: ${value} [${bar}]\n`;
        }
        
        tooltipContent += `\nClick to drag\n`;
        if (!isCentral) {
          tooltipContent += `Ctrl+Click to edit\nRight-click to set as central`;
        }
        
        this.nodeService.showTooltip(
          e.clientX, 
          e.clientY, 
          isCentral ? 'Central Node' : node.name, 
          tooltipContent,
          nodeId
        );
      }
    } else {
      this.nodeService.hideTooltip();
    }
  }

  private intersectNode(e: MouseEvent): THREE.Object3D | null {
    if (!this.camera || !this.scene) return null;
    const rect = this.threeCanvasRef.nativeElement.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const objs = [...this.nodeSpheres];
    const hits = this.raycaster.intersectObjects(objs, false);
    return hits.length ? hits[0].object : null;
  }

  private onMouseDown(e: MouseEvent): void {
    const obj = this.intersectNode(e);
    if (obj) {
      const nodeId = (obj as any).nodeId;
      
      if (e.button === 0) { // Left click - start dragging or editing
        if (e.ctrlKey || e.metaKey) { // Ctrl/Cmd + click - edit attributes
          this.startEditingNode(nodeId, 0); // Start editing first attribute
        } else {
          this.dragging = true;
          this.dragged = obj;
        }
      } else if (e.button === 2) { // Right click - set as central node
        e.preventDefault();
        this.onCentralNodeChange(nodeId);
      }
    }
  }

  private onMouseUp(): void {
    this.dragging = false;
    this.dragged = null;
    // When dragging stops, nodes will automatically return to equilibrium positions
    // due to the stepPhysics method checking for distance from equilibrium
  }


}
