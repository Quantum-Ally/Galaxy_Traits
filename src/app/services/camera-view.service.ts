import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import * as THREE from 'three';

export interface CameraView {
  id: string;
  name: string;
  icon: string;
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  isFree: boolean;
  description: string;
}

@Injectable({
  providedIn: 'root'
})
export class CameraViewService {
  private currentViewSubject = new BehaviorSubject<string>('free');
  private isDropdownOpenSubject = new BehaviorSubject<boolean>(false);
  
  public currentView$ = this.currentViewSubject.asObservable();
  public isDropdownOpen$ = this.isDropdownOpenSubject.asObservable();

  private readonly cameraViews: CameraView[] = [
    {
      id: 'free',
      name: 'Free View',
      icon: '🎮',
      position: { x: 0, y: 0, z: 120 },
      target: { x: 0, y: 0, z: 0 },
      isFree: true,
      description: 'Freely movable camera with orbit controls'
    },
    {
      id: 'top',
      name: 'Top View',
      icon: '⬆️',
      position: { x: 0, y: 200, z: 0 },
      target: { x: 0, y: 0, z: 0 },
      isFree: false,
      description: 'Bird\'s eye view from above'
    },
    {
      id: 'front',
      name: 'Front View',
      icon: '👁️',
      position: { x: 0, y: 0, z: 150 },
      target: { x: 0, y: 0, z: 0 },
      isFree: false,
      description: 'Front-facing perspective'
    },
    {
      id: 'side',
      name: 'Side View',
      icon: '↔️',
      position: { x: 150, y: 0, z: 0 },
      target: { x: 0, y: 0, z: 0 },
      isFree: false,
      description: 'Side perspective view'
    },
    {
      id: 'iso',
      name: 'Isometric',
      icon: '📐',
      position: { x: 100, y: 100, z: 100 },
      target: { x: 0, y: 0, z: 0 },
      isFree: false,
      description: 'Isometric 3D view'
    },
    {
      id: 'close',
      name: 'Close Up',
      icon: '🔍',
      position: { x: 0, y: 0, z: 50 },
      target: { x: 0, y: 0, z: 0 },
      isFree: false,
      description: 'Close-up detailed view'
    }
  ];

  constructor() {}

  getCameraViews(): CameraView[] {
    return [...this.cameraViews];
  }

  getCurrentView(): string {
    return this.currentViewSubject.value;
  }

  setCurrentView(viewId: string): void {
    console.log('Setting current view to:', viewId);
    this.currentViewSubject.next(viewId);
  }

  getViewById(viewId: string): CameraView | undefined {
    return this.cameraViews.find(view => view.id === viewId);
  }

  toggleDropdown(): void {
    this.isDropdownOpenSubject.next(!this.isDropdownOpenSubject.value);
  }

  closeDropdown(): void {
    this.isDropdownOpenSubject.next(false);
  }

  openDropdown(): void {
    this.isDropdownOpenSubject.next(true);
  }

  applyCameraView(camera: THREE.PerspectiveCamera, controls: any, viewId: string): void {
    const view = this.getViewById(viewId);
    if (!view) {
      console.log('View not found:', viewId);
      return;
    }

    console.log('Applying camera view:', viewId, view);

    if (view.isFree) {
      // For free view, enable controls and set initial position
      controls.enabled = true;
      controls.enableRotate = true;
      controls.enablePan = true;
      controls.enableZoom = true;
      camera.position.set(view.position.x, view.position.y, view.position.z);
      controls.target.set(view.target.x, view.target.y, view.target.z);
      controls.update();
      console.log('Free view applied - controls enabled');
    } else {
      // For fixed views, disable controls and animate to position
      controls.enabled = false;
      
      // Animate camera to new position
      const startPosition = camera.position.clone();
      const startTarget = controls.target.clone();
      
      const endPosition = new THREE.Vector3(view.position.x, view.position.y, view.position.z);
      const endTarget = new THREE.Vector3(view.target.x, view.target.y, view.target.z);
      
      console.log('Animating from:', startPosition, 'to:', endPosition);
      
      const duration = 1000; // 1 second animation
      const startTime = performance.now();
      
      const animate = () => {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Smooth easing function
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        
        // Interpolate position
        camera.position.lerpVectors(startPosition, endPosition, easeProgress);
        
        // Interpolate target
        controls.target.lerpVectors(startTarget, endTarget, easeProgress);
        
        // Update controls
        controls.update();
        
        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          // Animation complete
          camera.position.copy(endPosition);
          controls.target.copy(endTarget);
          controls.update();
          console.log('Fixed view animation complete');
        }
      };
      
      animate();
    }
  }

  // Method to manually apply current view (useful for debugging)
  applyCurrentView(camera: THREE.PerspectiveCamera, controls: any): void {
    const currentViewId = this.getCurrentView();
    console.log('Manually applying current view:', currentViewId);
    this.applyCameraView(camera, controls, currentViewId);
  }
}
