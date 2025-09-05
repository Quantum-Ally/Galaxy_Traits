import { Component, ElementRef, OnDestroy, OnInit, AfterViewInit, ViewChild, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

@Component({
  selector: 'app-spline-view',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './spline-view.component.html',
  styleUrls: ['./spline-view.component.scss']
})
export class SplineViewComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('threeCanvas', { static: true }) threeCanvasRef!: ElementRef<HTMLCanvasElement>;
  // Physics/Nodes
  numAttributes = signal<number>(3);
  numNodes = signal<number>(4); // Start with fewer nodes for testing
  attractionK = signal<number>(100); // Increased attraction
  repulsionK = signal<number>(20); // Reduced repulsion
  damping = signal<number>(0.98); // Less damping for more movement
  centralPreferences = signal<number[]>([50, 50, 50]);

  // UI State
  showControls = signal<boolean>(true);
  audioEnabled = signal<boolean>(false);
  tooltip = signal<{visible: boolean, x: number, y: number, title: string, content: string}>({
    visible: false,
    x: 0,
    y: 0,
    title: '',
    content: ''
  });

  // Node data for radial UI
  nodeData = [
    { id: 'biology', name: 'Programmable Biology', description: 'Advanced biological systems and synthetic biology research' },
    { id: 'web3', name: 'Scenius Web3', description: 'Decentralized technologies and blockchain innovation' },
    { id: 'computation', name: 'Breakthrough Computation', description: 'Quantum computing and advanced engineering solutions' },
    { id: 'about', name: 'About Blueyard', description: 'Information about Blueyard and our mission' },
    { id: 'knowledge', name: 'Liberated Knowledge', description: 'Open data and knowledge sharing initiatives' }
  ];

  // Node management
  selectedCentralNodeId = signal<string>('node-0');
  editingNodeId = signal<string | null>(null);
  editingAttributeIndex = signal<number>(-1);

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

  constructor() {}

  ngOnInit(): void {}

  ngAfterViewInit(): void {
    // Avoid SSR accessing DOM
    if (typeof window === 'undefined') return;
    this.initThree();
    this.createParticleSystem();
    this.resetNodes();
    this.start();
  }

  ngOnDestroy(): void {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    this.controls?.dispose();
    this.renderer?.dispose();
  }

  private initThree(): void {
    const canvas = this.threeCanvasRef.nativeElement;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
    if (!this.scene) return;
    
    // Clear existing
    for (const m of this.nodeSpheres) this.scene.remove(m);
    if (this.centralSphere) this.scene.remove(this.centralSphere);
    this.nodeSpheres = [];
    this.nodeAttributes = [];
    this.velocities = [];

    // Create central sphere
    const centralGeom = new THREE.SphereGeometry(2, 32, 32);
    const centralMat = new THREE.MeshStandardMaterial({ 
      color: 0xC300FF, 
      emissive: 0x8a00cc, 
      emissiveIntensity: 0.7, 
      metalness: 0.2, 
      roughness: 0.3 
    });
    this.centralSphere = new THREE.Mesh(centralGeom, centralMat);
    this.centralSphere.position.set(0, 0, 0);
    this.scene.add(this.centralSphere);

    // Create node spheres
    const count = this.numNodes();
    const attrLen = this.numAttributes();
    for (let i = 0; i < count; i++) {
      const sphereRadius = 0.6 + Math.random() * 0.4;
      const geom = new THREE.SphereGeometry(sphereRadius, 24, 24);
      const color = new THREE.Color(0xFF3366).offsetHSL(0, 0, (Math.random() - 0.5) * 0.2);
      const mat = new THREE.MeshStandardMaterial({ 
        color, 
        emissive: 0x5a001b, 
        emissiveIntensity: 0.5 
      });
      const mesh = new THREE.Mesh(geom, mat);
      // Start nodes closer to center with some orbital velocity
      const angle = (i / count) * Math.PI * 2;
      const orbitRadius = 20 + Math.random() * 30; // Start closer to center
      mesh.position.set(
        Math.cos(angle) * orbitRadius,
        (Math.random() - 0.5) * 10, // Small vertical spread
        Math.sin(angle) * orbitRadius
      );
      (mesh as any).isNode = true;
      this.scene.add(mesh);
      this.nodeSpheres.push(mesh);

      const attrs: number[] = [];
      for (let j = 0; j < attrLen; j++) attrs.push(Math.floor(Math.random() * 101));
      this.nodeAttributes.push(attrs);
      
      // Add some initial orbital velocity
      const orbitalVelocity = new THREE.Vector3(
        -Math.sin(angle) * 2, // Perpendicular to radius
        0,
        Math.cos(angle) * 2
      );
      this.velocities.push(orbitalVelocity);
    }
  }

  onNumNodesChange(value: number): void {
    this.numNodes.set(Number(value) || 0);
    this.resetNodes();
  }

  onNumAttributesChange(value: number): void {
    const len = Math.max(3, Math.min(10, Number(value) || 3));
    this.numAttributes.set(len);
    this.centralPreferences.set(Array.from({ length: len }, () => 50));
    this.resetNodes();
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
  }

  // UI Methods
  toggleControls(): void {
    this.showControls.set(!this.showControls());
  }

  toggleAudio(): void {
    this.audioEnabled.set(!this.audioEnabled());
  }

  selectNode(nodeId: string): void {
    const node = this.nodeData.find(n => n.id === nodeId);
    if (node) {
      // Update central preferences based on selected node
      const newPrefs = Array.from({ length: this.numAttributes() }, () => Math.floor(Math.random() * 101));
      this.centralPreferences.set(newPrefs);
      
      // Visual feedback
      this.showTooltip(0, 0, node.name, node.description);
      setTimeout(() => this.hideTooltip(), 3000);
    }
  }

  // Node management methods
  selectCentralNode(nodeId: string): void {
    this.selectedCentralNodeId.set(nodeId);
    // Update central preferences to match selected node's attributes
    const nodeIndex = this.nodeSpheres.findIndex((_, i) => `node-${i}` === nodeId);
    if (nodeIndex !== -1 && this.nodeAttributes[nodeIndex]) {
      this.centralPreferences.set([...this.nodeAttributes[nodeIndex]]);
    }
  }

  startEditingNode(nodeId: string, attributeIndex: number): void {
    this.editingNodeId.set(nodeId);
    this.editingAttributeIndex.set(attributeIndex);
  }

  updateNodeAttribute(nodeId: string, attributeIndex: number, value: number): void {
    const nodeIndex = this.nodeSpheres.findIndex((_, i) => `node-${i}` === nodeId);
    if (nodeIndex !== -1 && this.nodeAttributes[nodeIndex]) {
      this.nodeAttributes[nodeIndex][attributeIndex] = Math.max(0, Math.min(100, value));
      
      // If this is the central node, update preferences too
      if (nodeId === this.selectedCentralNodeId()) {
        this.centralPreferences.set([...this.nodeAttributes[nodeIndex]]);
      }
    }
  }

  stopEditingNode(): void {
    this.editingNodeId.set(null);
    this.editingAttributeIndex.set(-1);
  }

  getNodeAttributes(nodeId: string): number[] {
    const nodeIndex = this.nodeSpheres.findIndex((_, i) => `node-${i}` === nodeId);
    return nodeIndex !== -1 ? this.nodeAttributes[nodeIndex] : [];
  }

  getCentralNodeAttributes(): number[] {
    return this.centralPreferences();
  }

  showTooltip(x: number, y: number, title: string, content: string): void {
    this.tooltip.set({
      visible: true,
      x: x,
      y: y,
      title: title,
      content: content
    });
  }

  hideTooltip(): void {
    this.tooltip.set({
      visible: false,
      x: 0,
      y: 0,
      title: '',
      content: ''
    });
  }

  private createParticleSystem(): void {
    if (!this.scene) return;

    const particleCount = 1000;
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
      size: 2,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
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

  private compatibility(prefs: number[], attrs: number[]): number {
    const len = Math.min(prefs.length, attrs.length);
    const maxDiff = len * 100;
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Math.abs(prefs[i] - attrs[i]);
    return 1 - sum / maxDiff;
  }

  private similarity(a: number[], b: number[]): number {
    const len = Math.min(a.length, b.length);
    const maxDiff = len * 100;
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Math.abs(a[i] - b[i]);
    return 1 - sum / maxDiff;
  }

  // Multi-dimensional force calculation as per requirements
  private calculateMultiDimensionalForces(centralPrefs: number[], nodeAttrs: number[]): THREE.Vector3 {
    const force = new THREE.Vector3();
    const len = Math.min(centralPrefs.length, nodeAttrs.length);
    
    // For 3D visualization, map first 3 attributes to x,y,z forces
    // For more attributes, distribute them across the 3D space
    for (let i = 0; i < len; i++) {
      const diff = centralPrefs[i] - nodeAttrs[i];
      const normalizedDiff = diff / 100; // Normalize to -1 to 1
      
      // Map to 3D space: distribute attributes across dimensions
      const dimension = i % 3;
      if (dimension === 0) force.x += normalizedDiff;
      else if (dimension === 1) force.y += normalizedDiff;
      else force.z += normalizedDiff;
    }
    
    return force.normalize();
  }

  private stepPhysics(dt: number): void {
    if (!this.centralSphere) return;
    const prefs = this.centralPreferences();
    const kAtt = this.attractionK();
    const kRep = this.repulsionK();
    const damp = this.damping();

    // Attraction towards center - simplified and corrected
    for (let i = 0; i < this.nodeSpheres.length; i++) {
      const node = this.nodeSpheres[i];
      const attrs = this.nodeAttributes[i];
      const compat = Math.max(0.1, this.compatibility(prefs, attrs)); // Ensure minimum attraction
      
      // Calculate direction from node to center
      const d = new THREE.Vector3().subVectors(this.centralSphere.position, node.position);
      const distance = Math.max(d.length(), 0.1); // Prevent division by zero
      d.normalize();
      
      // Apply attraction force: F_attraction = k * Compatibility / distance^2
      const attractionForce = d.multiplyScalar((kAtt * compat) / (distance * distance));
      this.velocities[i].addScaledVector(attractionForce, dt);
    }

    // Repulsion between nodes - simplified and corrected
    for (let i = 0; i < this.nodeSpheres.length; i++) {
      for (let j = i + 1; j < this.nodeSpheres.length; j++) {
        const a = this.nodeSpheres[i];
        const b = this.nodeSpheres[j];
        const sim = Math.max(0, this.similarity(this.nodeAttributes[i], this.nodeAttributes[j]));
        
        // Calculate direction between nodes
        const d = new THREE.Vector3().subVectors(b.position, a.position);
        const distance = Math.max(d.length(), 0.1); // Prevent division by zero
        d.normalize();
        
        // Apply repulsion force: F_repulsion = k_rep * (1 - Similarity) / distance^2
        const repulsionForce = d.multiplyScalar((kRep * (1 - sim)) / (distance * distance));
        this.velocities[i].addScaledVector(repulsionForce, -dt);
        this.velocities[j].addScaledVector(repulsionForce, dt);
      }
    }

    // Integrate positions
    for (let i = 0; i < this.nodeSpheres.length; i++) {
      if (this.dragging && this.dragged === this.nodeSpheres[i]) continue;
      this.nodeSpheres[i].position.addScaledVector(this.velocities[i], dt);
      this.velocities[i].multiplyScalar(damp);
    }

    this.animateParticles(dt);
  }

  private animateParticles(dt: number): void {
    if (!this.particleSystem) return;

    const positions = this.particleSystem.geometry.attributes['position'].array as Float32Array;
    const time = performance.now() * 0.001;

    for (let i = 0; i < this.particles.length; i++) {
      const i3 = i * 3;
      const particle = this.particles[i];
      
      particle.x += Math.sin(time + i * 0.01) * 0.1 * dt;
      particle.y += Math.cos(time + i * 0.01) * 0.1 * dt;
      particle.z += Math.sin(time * 0.5 + i * 0.02) * 0.05 * dt;
      
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
      
      // Update node position in attributes array for physics recalculation
      const nodeIndex = this.nodeSpheres.indexOf(this.dragged as THREE.Mesh);
      if (nodeIndex !== -1) {
        // Force recalculation by updating velocity
        this.velocities[nodeIndex].set(0, 0, 0);
      }
    }

    const obj = this.intersectNode(e);
    if (obj && (obj as any).isNode) {
      const nodeIndex = this.nodeSpheres.indexOf(obj as THREE.Mesh);
      if (nodeIndex !== -1) {
        const attrs = this.nodeAttributes[nodeIndex];
        const compat = this.compatibility(this.centralPreferences(), attrs);
        const nodeId = `node-${nodeIndex}`;
        const isCentral = nodeId === this.selectedCentralNodeId();
        
        let tooltipContent = `Compatibility: ${(compat * 100).toFixed(1)}%\n`;
        tooltipContent += `Attributes: [${attrs.join(', ')}]\n`;
        tooltipContent += `Click to edit attributes\n`;
        if (!isCentral) {
          tooltipContent += `Right-click to set as central node`;
        }
        
        this.showTooltip(e.clientX, e.clientY, 
          isCentral ? `Central Node ${nodeIndex + 1}` : `Node ${nodeIndex + 1}`, 
          tooltipContent);
      }
    } else {
      this.hideTooltip();
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
      const nodeIndex = this.nodeSpheres.indexOf(obj as THREE.Mesh);
      const nodeId = `node-${nodeIndex}`;
      
      if (e.button === 0) { // Left click - start dragging or editing
        if (e.ctrlKey || e.metaKey) { // Ctrl/Cmd + click - edit attributes
          this.startEditingNode(nodeId, 0); // Start editing first attribute
        } else {
          this.dragging = true;
          this.dragged = obj;
        }
      } else if (e.button === 2) { // Right click - set as central node
        e.preventDefault();
        this.selectCentralNode(nodeId);
      }
    }
  }

  private onMouseUp(): void {
    this.dragging = false;
    this.dragged = null;
  }

}
