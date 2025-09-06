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
  attributeNames = signal<string[]>(['Intelligence', 'Creativity', 'Empathy']);
  
  // Attribute management dropdowns
  selectedNodeForAttributes = signal<string>('');
  selectedAttributeForEdit = signal<number>(-1);

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

    // Load attribute names from service (will be updated when nodes are generated)
    this.updateAttributeNamesFromService();
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
      this.updateAttributeNamesFromService();
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
    
    // Update central preferences to match new attribute count
    const currentPrefs = this.centralPreferences();
    const newPrefs = Array.from({ length: len }, (_, i) => currentPrefs[i] || 50);
    this.centralPreferences.set(newPrefs);
    
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
    // Continuous physics will automatically respond to changes
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
    // Continuous physics will automatically respond to changes
    
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
    // Continuous physics will automatically respond to changes
    
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
    
    // Recalculate equilibrium positions for new central node
    setTimeout(() => {
      console.log('Central node changed - recalculating equilibrium positions...');
      this.equilibriumPositions = []; // Clear to force recalculation
      this.centralNodeChangeInProgress = false; // Hide central node change indicator
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

  updateNodeAttribute(nodeId: string, attributeIndex: number, value: number): void {
    this.updateNodeAttributeValue(nodeId, attributeIndex, value);
  }

  getNodeAttributes(nodeId: string): number[] {
    const node = this.nodes.find(n => n.id === nodeId);
    return node ? node.attributes : [];
  }

  getNodeAttributeNames(): string[] {
    return this.nodeService.getAttributeNames();
  }

  getCurrentAttributeValues(): number[] {
    // Return the central preferences which drive compatibility calculations
    return this.centralPreferences();
  }

  getAttributeValuesForNode(nodeId: string): number[] {
    const node = this.nodes.find(n => n.id === nodeId);
    return node ? node.attributes : [];
  }

  updateCentralNodeAttribute(attributeIndex: number, event: Event): void {
    const target = event.target as HTMLInputElement;
    const value = parseInt(target.value, 10);
    
    if (isNaN(value) || value < 0 || value > 100) {
      // Reset to current value if invalid
      const currentValues = this.getCurrentAttributeValues();
      target.value = (currentValues[attributeIndex] || 0).toString();
      return;
    }
    
    // Update the central node's attribute
    const centralNodeId = this.selectedCentralNodeId();
    if (centralNodeId) {
      this.updateNodeAttributeValue(centralNodeId, attributeIndex, value);
      
      // Update central preferences to match the new value
      const currentPrefs = [...this.centralPreferences()];
      currentPrefs[attributeIndex] = value;
      this.centralPreferences.set(currentPrefs);
      
      // Recalculate all compatibilities with the new central preferences
      this.nodeService.updateAllCompatibilities(currentPrefs);
      
      // Clear equilibrium positions to trigger recalculation
      // Continuous physics will automatically respond to changes
    }
  }

  getCentralNodeAttributes(): number[] {
    return this.centralPreferences();
  }

  // Dynamic Attribute Management Methods
  addAttribute(): void {
    const currentAttributes = this.nodeService.getAttributeNames();
    
    // Check if we've reached the maximum number of attributes
    if (currentAttributes.length >= 15) {
      alert('Maximum number of attributes (15) reached. Please remove an attribute before adding a new one.');
      return;
    }
    
    const newAttributeName = prompt('Enter new attribute name:');
    if (!newAttributeName || !newAttributeName.trim()) {
      return; // User cancelled or entered empty name
    }
    
    const trimmedName = newAttributeName.trim();
    
    // Validate name length
    if (trimmedName.length > 30) {
      alert('Attribute name is too long. Please use 30 characters or less.');
      return;
    }
    
    // Validate name format (alphanumeric, spaces, and common punctuation)
    const nameRegex = /^[a-zA-Z0-9\s\-_.,!?()]+$/;
    if (!nameRegex.test(trimmedName)) {
      alert('Attribute name contains invalid characters. Please use only letters, numbers, spaces, and common punctuation.');
      return;
    }
    
    if (this.nodeService.validateAttributeName(trimmedName)) {
      this.nodeService.addAttribute(trimmedName, 50);
      this.updateAttributeNamesFromService();
      
      // Update central preferences to include the new attribute
      const currentPrefs = [...this.centralPreferences()];
      currentPrefs.push(50); // Default value for new attribute
      this.centralPreferences.set(currentPrefs);
      
      // Recalculate all compatibilities
      this.nodeService.updateAllCompatibilities(currentPrefs);
      
      // Recalculate equilibrium positions for static positioning
      this.equilibriumPositions = [];
    } else {
      alert('Attribute name already exists. Please choose a different name.');
    }
  }

  removeAttribute(attributeIndex: number): void {
    const attributeNames = this.nodeService.getAttributeNames();
    
    // Check if we have the minimum number of attributes
    if (attributeNames.length <= 1) {
      alert('Cannot remove the last attribute. At least one attribute is required.');
      return;
    }
    
    const attributeName = attributeNames[attributeIndex];
    
    if (!attributeName) {
      alert('Invalid attribute selected.');
      return;
    }
    
    if (confirm(`Are you sure you want to remove the attribute "${attributeName}"? This will affect all nodes and cannot be undone.`)) {
      this.nodeService.removeAttribute(attributeIndex);
      this.updateAttributeNamesFromService();
      
      // Update central preferences to remove the attribute
      const currentPrefs = [...this.centralPreferences()];
      currentPrefs.splice(attributeIndex, 1);
      this.centralPreferences.set(currentPrefs);
      
      // Recalculate all compatibilities
      this.nodeService.updateAllCompatibilities(currentPrefs);
      
      // Recalculate equilibrium positions for static positioning
      this.equilibriumPositions = [];
    }
  }

  renameAttribute(attributeIndex: number): void {
    const attributeNames = this.nodeService.getAttributeNames();
    const currentName = attributeNames[attributeIndex];
    
    if (!currentName) {
      alert('Invalid attribute selected.');
      return;
    }
    
    const newName = prompt(`Rename attribute "${currentName}":`, currentName);
    
    if (!newName || !newName.trim()) {
      return; // User cancelled or entered empty name
    }
    
    const trimmedName = newName.trim();
    
    if (trimmedName === currentName) {
      return; // No change
    }
    
    // Validate name length
    if (trimmedName.length > 30) {
      alert('Attribute name is too long. Please use 30 characters or less.');
      return;
    }
    
    // Validate name format
    const nameRegex = /^[a-zA-Z0-9\s\-_.,!?()]+$/;
    if (!nameRegex.test(trimmedName)) {
      alert('Attribute name contains invalid characters. Please use only letters, numbers, spaces, and common punctuation.');
      return;
    }
    
    if (this.nodeService.validateAttributeName(trimmedName, attributeIndex)) {
      this.nodeService.renameAttribute(attributeIndex, trimmedName);
      this.updateAttributeNamesFromService();
    } else {
      alert('Attribute name already exists. Please choose a different name.');
    }
  }

  updateNodeAttributeValue(nodeId: string, attributeIndex: number, value: number): void {
    // Validate input
    if (!nodeId || attributeIndex < 0 || isNaN(value)) {
      console.error('Invalid parameters for updateNodeAttributeValue');
      return;
    }
    
    // Clamp value to valid range
    const clampedValue = Math.max(0, Math.min(100, value));
    
    this.nodeService.updateNodeAttributeValue(nodeId, attributeIndex, clampedValue);
      
      // If this is the central node, update preferences too
      if (nodeId === this.selectedCentralNodeId()) {
      const node = this.nodes.find(n => n.id === nodeId);
      if (node) {
        this.centralPreferences.set([...node.attributes]);
        this.nodeService.updateAllCompatibilities(node.attributes);
      }
    }
  }

  private updateAttributeNamesFromService(): void {
    const serviceAttributeNames = this.nodeService.getAttributeNames();
    this.attributeNames.set(serviceAttributeNames);
  }

  // Dropdown-based attribute management methods
  onNodeSelectionChange(nodeId: string): void {
    this.selectedNodeForAttributes.set(nodeId);
    this.selectedAttributeForEdit.set(-1); // Reset attribute selection
  }

  onAttributeSelectionChange(attributeIndex: number): void {
    this.selectedAttributeForEdit.set(attributeIndex);
  }

  getSelectedNodeAttributes(): number[] {
    const nodeId = this.selectedNodeForAttributes();
    if (!nodeId) return [];
    return this.getNodeAttributes(nodeId);
  }

  getSelectedNodeAttributeValue(): number {
    const nodeId = this.selectedNodeForAttributes();
    const attributeIndex = this.selectedAttributeForEdit();
    if (!nodeId || attributeIndex === -1) return 0;
    
    const attributes = this.getNodeAttributes(nodeId);
    return attributes[attributeIndex] || 0;
  }

  updateSelectedNodeAttribute(event: Event): void {
    const target = event.target as HTMLInputElement;
    const value = parseInt(target.value, 10);
    
    if (isNaN(value)) return;
    
    const nodeId = this.selectedNodeForAttributes();
    const attributeIndex = this.selectedAttributeForEdit();
    
    if (!nodeId || attributeIndex === -1) return;
    
    // Clamp value to valid range
    const clampedValue = Math.max(0, Math.min(100, value));
    
    // Update the specific node's attribute
    this.updateNodeAttributeValue(nodeId, attributeIndex, clampedValue);
    
    // If this is the central node, also update central preferences
    if (nodeId === this.selectedCentralNodeId()) {
      const currentPrefs = [...this.centralPreferences()];
      currentPrefs[attributeIndex] = clampedValue;
      this.centralPreferences.set(currentPrefs);
      this.nodeService.updateAllCompatibilities(currentPrefs);
      // Continuous physics will automatically respond to changes
    }
  }

  getAvailableNodes(): Node[] {
    return this.nodes.filter(node => node.id); // Return all nodes
  }

  getAvailableAttributes(): string[] {
    return this.nodeService.getAttributeNames();
  }

  getSelectedNodeName(): string {
    const nodeId = this.selectedNodeForAttributes();
    if (!nodeId) return '';
    
    const node = this.nodes.find(n => n.id === nodeId);
    return node ? node.name : '';
  }

  getSelectedAttributeName(): string {
    const attributeIndex = this.selectedAttributeForEdit();
    if (attributeIndex === -1) return '';
    
    const attributes = this.getAvailableAttributes();
    return attributes[attributeIndex] || `Attribute ${attributeIndex + 1}`;
  }

  resetSelectedNodeToDefaults(): void {
    const nodeId = this.selectedNodeForAttributes();
    if (!nodeId) return;
    
    // Reset all attributes to 50 (default value)
    const defaultValues = Array.from({ length: this.getAvailableAttributes().length }, () => 50);
    
    // Update the node's attributes
    this.nodeService.updateNodeAttributes(nodeId, defaultValues);
    
    // If this is the central node, also update central preferences
    if (nodeId === this.selectedCentralNodeId()) {
      this.centralPreferences.set([...defaultValues]);
      this.nodeService.updateAllCompatibilities(defaultValues);
      // Continuous physics will automatically respond to changes
    }
  }

  resetSelectedAttributeToDefault(): void {
    const nodeId = this.selectedNodeForAttributes();
    const attributeIndex = this.selectedAttributeForEdit();
    
    if (!nodeId || attributeIndex === -1) return;
    
    // Reset only the selected attribute to 50 (default value)
    this.updateNodeAttribute(nodeId, attributeIndex, 50);
    
    // If this is the central node, also update central preferences
    if (nodeId === this.selectedCentralNodeId()) {
      const currentPrefs = [...this.centralPreferences()];
      currentPrefs[attributeIndex] = 50;
      this.centralPreferences.set(currentPrefs);
      this.nodeService.updateAllCompatibilities(currentPrefs);
      // Continuous physics will automatically respond to changes
    }
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
    // Continuous physics will automatically respond to changes
    
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

    // STATIC POSITIONING: Calculate equilibrium positions once and keep nodes there
    if (this.equilibriumPositions.length === 0) {
      this.calculateEquilibriumPositions();
      return;
    }

    // Keep nodes at their calculated equilibrium positions
    for (let i = 0; i < this.nodeSpheres.length; i++) {
      const mesh = this.nodeSpheres[i];
      const nodeId = (mesh as any).nodeId;
      const node = this.nodes.find(n => n.id === nodeId);
      
      if (!node || node.isCentral) {
        // Central node stays at center
        if (node && node.isCentral) {
          mesh.position.set(0, 0, 0);
        }
        continue;
      }

      // Skip currently dragged nodes
      if (this.dragging && this.dragged === mesh) continue;
      
      // Move to equilibrium position with smooth interpolation
      const targetPosition = this.equilibriumPositions[i];
      if (targetPosition) {
        const currentPos = mesh.position;
        const distance = currentPos.distanceTo(targetPosition);
        
        // If node is far from equilibrium, smoothly move it there
        if (distance > 0.1) {
          const returnSpeed = 2.0;
          const direction = targetPosition.clone().sub(currentPos).normalize();
          const moveDistance = Math.min(distance, returnSpeed * dt);
          
          mesh.position.add(direction.multiplyScalar(moveDistance));
          
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
    
    console.log('Calculating attribute-based equilibrium positions...');
    
    // Get current node data
    const currentNodes = this.nodeService.nodesSubject.value;
    const currentCentralNode = this.nodeService.centralNodeSubject.value;
    
    if (!currentCentralNode) return;

    // Initialize equilibrium positions array
    this.equilibriumPositions = [];
    
    // Group nodes by their attribute values for clustering
    const nodeGroups = new Map<string, Node[]>();
    
    // Calculate position for each node
    for (let i = 0; i < this.nodeSpheres.length; i++) {
      const mesh = this.nodeSpheres[i];
      const nodeId = (mesh as any).nodeId;
      const node = currentNodes.find(n => n.id === nodeId);
      
      if (!node) {
        this.equilibriumPositions[i] = new THREE.Vector3(0, 0, 0);
        continue;
      }
      
      if (node.isCentral) {
        // Central node at center
        this.equilibriumPositions[i] = new THREE.Vector3(0, 0, 0);
        continue;
      }
      
      // Create a deterministic key based on attribute values
      const attributeKey = node.attributes.join(',');
      
      if (!nodeGroups.has(attributeKey)) {
        nodeGroups.set(attributeKey, []);
      }
      nodeGroups.get(attributeKey)!.push(node);
    }
    
    // Calculate positions for each group
    let groupIndex = 0;
    for (const [attributeKey, nodes] of nodeGroups) {
      // Calculate compatibility with central node (same for all nodes in group)
      const compatibility = this.physicsService.calculateCompatibility(
        currentCentralNode.attributes,
        nodes[0].attributes
      );
      
      // Base distance from center based on compatibility (higher compatibility = closer)
      const baseDistance = 15 + (1 - compatibility) * 60; // Range: 15-75 units
      
      // Calculate deterministic angle based on attribute values
      const attributeHash = this.hashAttributeValues(nodes[0].attributes);
      const angle = (attributeHash % 360) * (Math.PI / 180); // Convert to radians
      
      // Calculate height based on attribute values (deterministic)
      const heightHash = this.hashAttributeValues(nodes[0].attributes.slice().reverse());
      const height = ((heightHash % 100) - 50) * 0.4; // Range: -20 to +20
      
      // Base position for this attribute group
      const basePosition = new THREE.Vector3(
        Math.cos(angle) * baseDistance,
        height,
        Math.sin(angle) * baseDistance
      );
      
      // Position each node in the group around the base position
      for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
        const node = nodes[nodeIndex];
        const meshIndex = this.nodeSpheres.findIndex(mesh => (mesh as any).nodeId === node.id);
        
        if (meshIndex === -1) continue;
        
        let targetPosition: THREE.Vector3;
        
        if (nodes.length === 1) {
          // Single node - place at base position
          targetPosition = basePosition.clone();
        } else {
          // Multiple nodes with same attributes - arrange in a circle around base position
          const nodeAngle = (nodeIndex / nodes.length) * Math.PI * 2;
          const clusterRadius = 3 + nodeIndex * 1.5; // Small radius for clustering
          
          targetPosition = new THREE.Vector3(
            basePosition.x + Math.cos(nodeAngle) * clusterRadius,
            basePosition.y + (nodeIndex % 2 === 0 ? 2 : -2), // Slight vertical offset
            basePosition.z + Math.sin(nodeAngle) * clusterRadius
          );
        }
        
        // Apply repulsion from other groups to avoid overlap
        const minDistance = 8;
        const maxIterations = 10;
        
        for (let iter = 0; iter < maxIterations; iter++) {
          let repulsionForce = new THREE.Vector3(0, 0, 0);
          let hasRepulsion = false;
          
          // Check repulsion from other groups
          for (const [otherKey, otherNodes] of nodeGroups) {
            if (otherKey === attributeKey) continue;
            
            // Calculate similarity between groups
            const similarity = this.physicsService.calculateSimilarity(
              nodes[0].attributes,
              otherNodes[0].attributes
            );
            
            // Get approximate position of other group
            const otherCompatibility = this.physicsService.calculateCompatibility(
              currentCentralNode.attributes,
              otherNodes[0].attributes
            );
            const otherDistance = 15 + (1 - otherCompatibility) * 60;
            const otherAngle = (this.hashAttributeValues(otherNodes[0].attributes) % 360) * (Math.PI / 180);
            const otherHeight = ((this.hashAttributeValues(otherNodes[0].attributes.slice().reverse()) % 100) - 50) * 0.4;
            
            const otherGroupPos = new THREE.Vector3(
              Math.cos(otherAngle) * otherDistance,
              otherHeight,
              Math.sin(otherAngle) * otherDistance
            );
            
            const direction = targetPosition.clone().sub(otherGroupPos);
            const distance = direction.length();
            
            // Apply repulsion based on similarity
            if (distance < minDistance * 2) {
              hasRepulsion = true;
              const repulsionStrength = (1 - similarity) * 3.0; // Less similar = more repulsion
              const repulsionMagnitude = repulsionStrength / (distance * distance);
              
              repulsionForce.add(direction.normalize().multiplyScalar(repulsionMagnitude));
            }
          }
          
          // Apply repulsion force to adjust position
          if (hasRepulsion) {
            targetPosition.add(repulsionForce.multiplyScalar(0.3));
          }
          
          // Keep within reasonable bounds
          const distanceFromCenter = targetPosition.length();
          if (distanceFromCenter > 120) {
            targetPosition.normalize().multiplyScalar(120);
          } else if (distanceFromCenter < 8) {
            targetPosition.normalize().multiplyScalar(8);
          }
        }
        
        this.equilibriumPositions[meshIndex] = targetPosition;
      }
      
      groupIndex++;
    }
    
    console.log('Attribute-based equilibrium positions calculated!');
  }
  
  private hashAttributeValues(attributes: number[]): number {
    // Create a deterministic hash from attribute values
    let hash = 0;
    for (let i = 0; i < attributes.length; i++) {
      hash = ((hash << 5) - hash + attributes[i]) & 0xffffffff;
    }
    return Math.abs(hash);
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
      // Get current node data directly from service to ensure we have the latest attributes
      const currentNodes = this.nodeService.nodesSubject.value;
      const node = currentNodes.find(n => n.id === nodeId);
      
      if (node) {
        const isCentral = node.isCentral;
        // Get current central node preferences for compatibility calculation
        const currentCentralNode = this.nodeService.centralNodeSubject.value;
        const centralPrefs = currentCentralNode ? currentCentralNode.attributes : this.centralPreferences();
        
        const compat = this.physicsService.calculateCompatibility(
          centralPrefs,
          node.attributes
        );
        
        let tooltipContent = `Compatibility: ${(compat * 100).toFixed(1)}%\n\n`;
        tooltipContent += `Attributes:\n`;
        
        // Show attributes with names and visual indicators
        const attrNames = this.nodeService.getAttributeNames();
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
          // Set the node in the attribute management dropdown
          this.selectedNodeForAttributes.set(nodeId);
          this.selectedAttributeForEdit.set(-1); // Reset attribute selection
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
