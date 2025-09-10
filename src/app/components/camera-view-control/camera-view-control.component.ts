import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CameraViewService, CameraView } from '../../services/camera-view.service';

@Component({
  selector: 'app-camera-view-control',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="camera-view-container">
      <!-- Main Camera Button -->
      <button 
        class="camera-main-btn"
        (click)="toggleDropdown()"
        [class.active]="isDropdownOpen"
        [attr.aria-label]="'Camera View: ' + currentViewName">
        <div class="camera-icon">
          {{ currentViewIcon }}
        </div>
        <div class="camera-label">Camera</div>
        <div class="dropdown-arrow" [class.open]="isDropdownOpen">▼</div>
      </button>

      <!-- Radial Dropdown Menu -->
      <div class="radial-dropdown" [class.open]="isDropdownOpen">
        <div class="radial-menu">
          <div 
            *ngFor="let view of cameraViews; let i = index" 
            class="radial-item"
            [style.transform]="getItemTransform(i)"
            [style.animation-delay]="(i * 50) + 'ms'"
            (click)="selectView(view.id); $event.stopPropagation()"
            (mousedown)="selectView(view.id); $event.stopPropagation()"
            [class.active]="view.id === currentView"
            [attr.aria-label]="view.description"
            (mouseenter)="onHover(view.id)"
            (mouseleave)="onLeave(view.id)">
            <div class="radial-icon">{{ view.icon }}</div>
            <div class="radial-label">{{ view.name }}</div>
            <div class="radial-tooltip">{{ view.description }}</div>
          </div>
        </div>
        
        <!-- Center Info -->
        <div class="radial-center">
          <div class="center-icon">📷</div>
          <div class="center-text">Views</div>
        </div>
      </div>

      <!-- Backdrop -->
      <div 
        class="dropdown-backdrop" 
        [class.visible]="isDropdownOpen"
        (click)="closeDropdown()">
      </div>
      
    </div>
  `,
  styles: [`
    /* Force camera button positioning */
    app-camera-view-control .camera-main-btn {
      position: fixed !important;
      top: 20px !important;
      right: 20px !important;
      left: auto !important;
      transform: none !important;
    }
    
    .camera-view-container {
      position: relative;
      z-index: 9999;
    }

     .camera-main-btn {
       position: fixed !important;
       top: 20px !important;
       right: 20px !important;
       left: auto !important;
       width: 80px;
       height: 80px;
       border-radius: 50%;
       border: 3px solid #ffffff;
       background: linear-gradient(145deg, #ff6b6b, #ee5a52);
       box-shadow: 
         8px 8px 16px rgba(0, 0, 0, 0.3),
         -8px -8px 16px rgba(255, 255, 255, 0.05);
       cursor: pointer;
       transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
       display: flex;
       flex-direction: column;
       align-items: center;
       justify-content: center;
       color: #ffffff;
       font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
       overflow: hidden;
       position: relative;
       z-index: 99999;
     }

    .camera-main-btn:hover {
      transform: translateY(-2px);
      box-shadow: 
        12px 12px 24px rgba(0, 0, 0, 0.4),
        -12px -12px 24px rgba(255, 255, 255, 0.08);
    }

    .camera-main-btn.active {
      background: linear-gradient(145deg, #3a3a3a, #2a2a2a);
      transform: scale(1.05);
    }

    .camera-icon {
      font-size: 24px;
      margin-bottom: 4px;
      filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
    }

    .camera-label {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      opacity: 0.9;
    }

    .dropdown-arrow {
      position: absolute;
      bottom: 8px;
      font-size: 8px;
      transition: transform 0.3s ease;
      opacity: 0.7;
    }

    .dropdown-arrow.open {
      transform: rotate(180deg);
    }

     .radial-dropdown {
       position: fixed !important;
       top: 80px !important;
       right: 20px !important;
       left: auto !important;
       width: 300px;
       height: 300px;
       pointer-events: none;
       opacity: 0;
       transform: scale(0.8);
       transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
       z-index: 10000;
     }

    .radial-dropdown.open {
      pointer-events: all;
      opacity: 1;
      transform: scale(1);
    }

    .radial-menu {
      position: relative;
      width: 100%;
      height: 100%;
    }

    .radial-item {
      position: absolute;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: linear-gradient(145deg, #3a3a3a, #2a2a2a);
      box-shadow: 
        6px 6px 12px rgba(0, 0, 0, 0.3),
        -6px -6px 12px rgba(255, 255, 255, 0.05);
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      color: #ffffff;
      font-size: 12px;
      font-weight: 600;
      text-align: center;
      opacity: 0;
      transform: scale(0);
      animation: radialItemAppear 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards;
      position: relative;
      overflow: hidden;
      pointer-events: all;
      z-index: 10001;
    }

    .radial-item:hover {
      transform: scale(1.1);
      background: linear-gradient(145deg, #4a4a4a, #3a3a3a);
      box-shadow: 
        8px 8px 16px rgba(0, 0, 0, 0.4),
        -8px -8px 16px rgba(255, 255, 255, 0.08);
    }

    .radial-item.active {
      background: linear-gradient(145deg, #0066cc, #004499);
      box-shadow: 
        6px 6px 12px rgba(0, 102, 204, 0.3),
        -6px -6px 12px rgba(0, 102, 204, 0.1);
    }

    .radial-icon {
      font-size: 20px;
      margin-bottom: 2px;
      filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
      pointer-events: none;
    }

    .radial-label {
      font-size: 8px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      opacity: 0.9;
      pointer-events: none;
    }

    .radial-tooltip {
      position: absolute;
      bottom: -30px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.9);
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 10px;
      white-space: nowrap;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.3s ease;
      z-index: 1001;
    }

    .radial-item:hover .radial-tooltip {
      opacity: 1;
    }

    .radial-center {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: linear-gradient(145deg, #1a1a1a, #0a0a0a);
      box-shadow: 
        inset 4px 4px 8px rgba(0, 0, 0, 0.3),
        inset -4px -4px 8px rgba(255, 255, 255, 0.05);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #ffffff;
      font-size: 12px;
      font-weight: 600;
      text-align: center;
      opacity: 0;
      animation: centerAppear 0.6s cubic-bezier(0.4, 0, 0.2, 1) 0.2s forwards;
    }

    .center-icon {
      font-size: 20px;
      margin-bottom: 2px;
      filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
    }

    .center-text {
      font-size: 8px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      opacity: 0.8;
    }

    .dropdown-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.1);
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.3s ease;
      z-index: 999;
    }

    .dropdown-backdrop.visible {
      opacity: 1;
      pointer-events: all;
    }

    @keyframes radialItemAppear {
      from {
        opacity: 0;
        transform: scale(0) rotate(0deg);
      }
      to {
        opacity: 1;
        transform: scale(1) rotate(360deg);
      }
    }

    @keyframes centerAppear {
      from {
        opacity: 0;
        transform: translate(-50%, -50%) scale(0);
      }
      to {
        opacity: 1;
        transform: translate(-50%, -50%) scale(1);
      }
    }


     /* Responsive adjustments */
     @media (max-width: 768px) {
       .camera-main-btn {
         width: 60px;
         height: 60px;
         top: 15px;
         right: 15px;
       }

       .camera-icon {
         font-size: 20px;
       }

       .camera-label {
         font-size: 9px;
       }

       .radial-dropdown {
         width: 250px;
         height: 250px;
         top: 80px;
         right: 15px;
       }

       .radial-item {
         width: 50px;
         height: 50px;
       }

       .radial-icon {
         font-size: 16px;
       }

       .radial-label {
         font-size: 7px;
       }
     }
  `]
})
export class CameraViewControlComponent implements OnInit, OnDestroy {
  cameraViews: CameraView[] = [];
  currentView = 'free';
  currentViewName = 'Free View';
  currentViewIcon = '🎮';
  isDropdownOpen = false;

  constructor(private cameraViewService: CameraViewService) {}

  ngOnInit(): void {
    console.log('CameraViewControlComponent initialized');
    
    try {
      this.cameraViews = this.cameraViewService.getCameraViews();
      console.log('Camera views loaded:', this.cameraViews);
      
      this.cameraViewService.currentView$.subscribe(viewId => {
        this.currentView = viewId;
        const view = this.cameraViewService.getViewById(viewId);
        if (view) {
          this.currentViewName = view.name;
          this.currentViewIcon = view.icon;
        }
      });

      this.cameraViewService.isDropdownOpen$.subscribe(isOpen => {
        this.isDropdownOpen = isOpen;
      });
    } catch (error) {
      console.error('Error initializing camera view control:', error);
    }
  }

  ngOnDestroy(): void {
    // Cleanup handled by service
  }

  toggleDropdown(): void {
    this.cameraViewService.toggleDropdown();
  }

  closeDropdown(): void {
    this.cameraViewService.closeDropdown();
  }

  selectView(viewId: string): void {
    console.log('Selecting camera view:', viewId);
    this.cameraViewService.setCurrentView(viewId);
    this.cameraViewService.closeDropdown();
  }

  // Debug methods for hover events
  onHover(viewId: string): void {
    console.log('🔥 HOVER DETECTED on radial item:', viewId);
  }

  onLeave(viewId: string): void {
    console.log('👋 LEAVE DETECTED on radial item:', viewId);
  }

  getItemTransform(index: number): string {
    const totalItems = this.cameraViews.length;
    const angle = (index / totalItems) * 2 * Math.PI - Math.PI / 2; // Start from top
    const radius = 100; // Distance from center
    
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    
    return `translate(${x}px, ${y}px)`;
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: KeyboardEvent): void {
    if (this.isDropdownOpen) {
      this.closeDropdown();
    }
  }
}
