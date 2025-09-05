import { Component, ElementRef, OnDestroy, OnInit, AfterViewInit, ViewChild, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SplineSceneService } from '../../services/spline-scene.service';
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
  @ViewChild('splineCanvas', { static: true }) splineCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('threeCanvas', { static: true }) threeCanvasRef!: ElementRef<HTMLCanvasElement>;

  sceneUrl = signal<string>('https://prod.spline.design/GXvGkxcZM-IduAZK/scene.splinecode');
  targetName = signal<string>('');
  posX = signal<number>(0);
  posY = signal<number>(0);
  posZ = signal<number>(0);
  loaded = signal<boolean>(false);
  lockCamera = signal<boolean>(false);

  // Physics/Nodes
  numAttributes = signal<number>(3);
  numNodes = signal<number>(10);
  attractionK = signal<number>(50);
  repulsionK = signal<number>(30);
  damping = signal<number>(0.95);
  centralPreferences = signal<number[]>([50, 50, 50]);

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
  private nodeAttributes: number[][] = [];
  private velocities: THREE.Vector3[] = [];

  constructor(private readonly spline: SplineSceneService) {}

  async load(): Promise<void> {
    const url = this.sceneUrl();
    if (!url) return;
    await this.spline.loadScene(url, this.splineCanvasRef.nativeElement);
    this.loaded.set(this.spline.isSceneLoaded());
  }

  applyPosition(): void {
    const ok = this.spline.setObjectPosition(
      this.targetName(),
      this.posX(),
      this.posY(),
      this.posZ()
    );
    if (!ok) {
      // eslint-disable-next-line no-console
      console.warn('Object not found:', this.targetName());
    }
  }

  ngOnInit(): void {}

  ngAfterViewInit(): void {
    // Avoid SSR accessing DOM
    if (typeof window === 'undefined') return;
    this.initThree();
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
    this.nodeAttributes = [];
    this.velocities = [];

    const centralGeom = new THREE.SphereGeometry(2, 32, 32);
    const centralMat = new THREE.MeshStandardMaterial({ color: 0xC300FF, emissive: 0x8a00cc, emissiveIntensity: 0.7, metalness: 0.2, roughness: 0.3 });
    this.centralSphere = new THREE.Mesh(centralGeom, centralMat);
    this.centralSphere.position.set(0, 0, 0);
    this.scene.add(this.centralSphere);

    const count = this.numNodes();
    const attrLen = this.numAttributes();
    for (let i = 0; i < count; i++) {
      const radius = 0.6 + Math.random() * 0.4;
      const geom = new THREE.SphereGeometry(radius, 24, 24);
      const color = new THREE.Color(0xFF3366).offsetHSL(0, 0, (Math.random() - 0.5) * 0.2);
      const mat = new THREE.MeshStandardMaterial({ color, emissive: 0x5a001b, emissiveIntensity: 0.5 });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set((Math.random() - 0.5) * 100, (Math.random() - 0.5) * 100, (Math.random() - 0.5) * 100);
      (mesh as any).isNode = true;
      this.scene.add(mesh);
      this.nodeSpheres.push(mesh);

      const attrs: number[] = [];
      for (let j = 0; j < attrLen; j++) attrs.push(Math.floor(Math.random() * 101));
      this.nodeAttributes.push(attrs);
      this.velocities.push(new THREE.Vector3());
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
    const prefs = this.centralPreferences();
    const kAtt = this.attractionK();
    const kRep = this.repulsionK();
    const damp = this.damping();

    // Attraction towards center
    for (let i = 0; i < this.nodeSpheres.length; i++) {
      const node = this.nodeSpheres[i];
      const attrs = this.nodeAttributes[i];
      const compat = Math.max(0, this.compatibility(prefs, attrs));
      const d = new THREE.Vector3().subVectors(this.centralSphere.position, node.position);
      const distSq = Math.max(d.lengthSq(), 1);
      d.normalize();
      const force = d.multiplyScalar((kAtt * compat) / distSq);
      this.velocities[i].addScaledVector(force, dt);
    }

    // Repulsion between nodes based on dissimilarity
    for (let i = 0; i < this.nodeSpheres.length; i++) {
      for (let j = i + 1; j < this.nodeSpheres.length; j++) {
        const a = this.nodeSpheres[i];
        const b = this.nodeSpheres[j];
        const sim = Math.max(0, this.similarity(this.nodeAttributes[i], this.nodeAttributes[j]));
        const d = new THREE.Vector3().subVectors(b.position, a.position);
        const distSq = Math.max(d.lengthSq(), 1);
        d.normalize();
        const forceMag = (kRep * (1 - sim)) / distSq;
        const f = d.multiplyScalar(forceMag);
        this.velocities[i].addScaledVector(f, -dt);
        this.velocities[j].addScaledVector(f, dt);
      }
    }

    // Integrate positions with damping
    for (let i = 0; i < this.nodeSpheres.length; i++) {
      if (this.dragging && this.dragged === this.nodeSpheres[i]) continue;
      this.nodeSpheres[i].position.addScaledVector(this.velocities[i], dt);
      this.velocities[i].multiplyScalar(damp);
    }
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
      // Project a point in front of camera at fixed depth
      const depth = 200;
      const vector = new THREE.Vector3(this.mouse.x, this.mouse.y, 0.5).unproject(this.camera);
      const dir = vector.sub(this.camera.position).normalize();
      const pos = this.camera.position.clone().add(dir.multiplyScalar(depth));
      this.dragged.position.copy(pos);
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
    }
  }

  private onMouseUp(): void {
    this.dragging = false;
    this.dragged = null;
  }
