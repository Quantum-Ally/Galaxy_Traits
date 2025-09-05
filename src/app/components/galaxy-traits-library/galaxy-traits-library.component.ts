import { Component, ElementRef, OnDestroy, OnInit, AfterViewInit, ViewChild, signal, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface GalaxyNode {
  id: string;
  name: string;
  description: string;
  attributes: number[];
  position?: THREE.Vector3;
}

export interface GalaxyConfig {
  numNodes: number;
  numAttributes: number;
  attractionK: number;
  repulsionK: number;
  damping: number;
  centralPreferences: number[];
  showControls: boolean;
  theme: 'dark' | 'light';
  particleCount: number;
}

@Component({
  selector: 'galaxy-traits-library',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './galaxy-traits-library.component.html',
  styleUrls: ['./galaxy-traits-library.component.scss']
})
export class GalaxyTraitsLibraryComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('threeCanvas', { static: true }) threeCanvasRef!: ElementRef<HTMLCanvasElement>;

  // Inputs
  @Input() config: GalaxyConfig = {
    numNodes: 10,
    numAttributes: 3,
    attractionK: 50,
    repulsionK: 30,
    damping: 0.95,
    centralPreferences: [50, 50, 50],
    showControls: true,
    theme: 'dark',
    particleCount: 1000
  };

  @Input() nodes: GalaxyNode[] = [];

  // Outputs
  @Output() nodeSelected = new EventEmitter<GalaxyNode>();
  @Output() configChanged = new EventEmitter<GalaxyConfig>();

  // Internal state
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
  private nodeSpheres: THREE.Mesh[] = [];
  private velocities: THREE.Vector3[] = [];
  private particleSystem?: THREE.Points;
  private particles: THREE.Vector3[] = [];

  // UI State
  showControls = signal<boolean>(true);
  tooltip = signal<{visible: boolean, x: number, y: number, title: string, content: string}>({
    visible: false,
    x: 0,
    y: 0,
    title: '',
    content: ''
  });

  constructor() {}

  ngOnInit(): void {}

  ngAfterViewInit(): void {
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
    canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
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
    const count = this.config.numNodes;
    for (let i = 0; i < count; i++) {
      const radius = 0.6 + Math.random() * 0.4;
      const geom = new THREE.SphereGeometry(radius, 24, 24);
      const color = new THREE.Color(0xFF3366).offsetHSL(0, 0, (Math.random() - 0.5) * 0.2);
      const mat = new THREE.MeshStandardMaterial({ 
        color, 
        emissive: 0x5a001b, 
        emissiveIntensity: 0.5 
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(
        (Math.random() - 0.5) * 100, 
        (Math.random() - 0.5) * 100, 
        (Math.random() - 0.5) * 100
      );
      (mesh as any).isNode = true;
      (mesh as any).nodeIndex = i;
      this.scene.add(mesh);
      this.nodeSpheres.push(mesh);
      this.velocities.push(new THREE.Vector3());
    }
  }

  private createParticleSystem(): void {
    if (!this.scene) return;

    const particleCount = this.config.particleCount;
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

  private stepPhysics(dt: number): void {
    if (!this.centralSphere) return;
    const prefs = this.config.centralPreferences;
    const kAtt = this.config.attractionK;
    const kRep = this.config.repulsionK;
    const damp = this.config.damping;

    // Attraction towards center
    for (let i = 0; i < this.nodeSpheres.length; i++) {
      const node = this.nodeSpheres[i];
      const attrs = this.nodes[i]?.attributes || Array.from({ length: this.config.numAttributes }, () => Math.random() * 100);
      const compat = Math.max(0, this.compatibility(prefs, attrs));
      const d = new THREE.Vector3().subVectors(this.centralSphere.position, node.position);
      const distSq = Math.max(d.lengthSq(), 1);
      d.normalize();
      const force = d.multiplyScalar((kAtt * compat) / distSq);
      this.velocities[i].addScaledVector(force, dt);
    }

    // Repulsion between nodes
    for (let i = 0; i < this.nodeSpheres.length; i++) {
      for (let j = i + 1; j < this.nodeSpheres.length; j++) {
        const a = this.nodeSpheres[i];
        const b = this.nodeSpheres[j];
        const attrsA = this.nodes[i]?.attributes || Array.from({ length: this.config.numAttributes }, () => Math.random() * 100);
        const attrsB = this.nodes[j]?.attributes || Array.from({ length: this.config.numAttributes }, () => Math.random() * 100);
        const sim = Math.max(0, this.similarity(attrsA, attrsB));
        const d = new THREE.Vector3().subVectors(b.position, a.position);
        const distSq = Math.max(d.lengthSq(), 1);
        d.normalize();
        const forceMag = (kRep * (1 - sim)) / distSq;
        const f = d.multiplyScalar(forceMag);
        this.velocities[i].addScaledVector(f, -dt);
        this.velocities[j].addScaledVector(f, dt);
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
    }

    const obj = this.intersectNode(e);
    if (obj && (obj as any).isNode) {
      const nodeIndex = (obj as any).nodeIndex;
      const node = this.nodes[nodeIndex];
      if (node) {
        const attrs = node.attributes;
        const compat = this.compatibility(this.config.centralPreferences, attrs);
        this.showTooltip(e.clientX, e.clientY, node.name, 
          `Compatibility: ${(compat * 100).toFixed(1)}%\nAttributes: ${attrs.join(', ')}`);
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
      this.dragging = true;
      this.dragged = obj;
      
      const nodeIndex = (obj as any).nodeIndex;
      const node = this.nodes[nodeIndex];
      if (node) {
        this.nodeSelected.emit(node);
      }
    }
  }

  private onMouseUp(): void {
    this.dragging = false;
    this.dragged = null;
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

  updateConfig(newConfig: Partial<GalaxyConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.configChanged.emit(this.config);
    this.resetNodes();
  }
}
