import { Injectable } from '@angular/core';
import { Application, SPEObject } from '@splinetool/runtime';

@Injectable({
  providedIn: 'root'
})
export class SplineSceneService {
  private application?: Application;
  private isLoaded = false;

  constructor() { }

  async loadScene(sceneUrl: string, canvas: HTMLCanvasElement): Promise<void> {
    this.application = new Application(canvas);
    await this.application.load(sceneUrl);
    this.isLoaded = true;
  }

  isSceneLoaded(): boolean {
    return this.isLoaded;
  }

  findObjectByName(name: string): SPEObject | null {
    if (!this.application) return null;
    return this.application.findObjectByName(name) ?? null;
  }

  setObjectPosition(name: string, x: number, y: number, z: number): boolean {
    const obj = this.findObjectByName(name);
    if (!obj) return false;
    // Some runtime builds expose position as a plain {x,y,z} object
    if (typeof (obj.position as any).set === 'function') {
      (obj.position as any).set(x, y, z);
    } else {
      (obj.position as any).x = x;
      (obj.position as any).y = y;
      (obj.position as any).z = z;
    }
    return true;
  }

  setObjectVisible(name: string, visible: boolean): boolean {
    const obj = this.findObjectByName(name);
    if (!obj) return false;
    obj.visible = visible;
    return true;
  }

  addEventListener<T extends keyof HTMLElementEventMap>(
    event: T,
    listener: (ev: Event) => void
  ): void {
    // Spline runtime proxies DOM events through its Application canvas
    if (!this.application) return;
    const canvas = this.application.canvas as HTMLCanvasElement | undefined;
    canvas?.addEventListener(event, listener as EventListener);
  }
}
