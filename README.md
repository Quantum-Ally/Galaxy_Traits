# 🌌 Galaxy - 3D Node Visualization System

A sophisticated 3D visualization system built with Angular and Three.js that creates an interactive galaxy of interconnected nodes representing people, traits, and relationships.

## 🚀 Features

### 🎥 Advanced Camera System
- **Free View Mode**: Freely movable camera with orbit controls
- **Fixed View Modes**: 
  - Top View (Bird's eye perspective)
  - Front View (Direct front perspective)
  - Side View (Side perspective)
  - Isometric View (3D diagonal view)
  - Close-up View (Zoomed detail view)
- **Smooth Animations**: Fluid transitions between camera views
- **Interactive UI**: Radial dropdown menu for camera control

### 🌟 Node System
- **Central Node**: Main focal point that other nodes orbit around
- **Dynamic Node Generation**: Customizable number of nodes (3-20)
- **Attribute-based Positioning**: Nodes position based on compatibility with central node
- **Real-time Physics**: Equilibrium-based positioning system
- **Interactive Nodes**: Drag, hover, and click interactions

### 🎛️ Attribute Management
- **Dynamic Attributes**: Add, remove, and rename attributes on-the-fly
- **Customizable Values**: 0-100 scale for each attribute
- **Visual Feedback**: Real-time compatibility calculations
- **Attribute Editing**: Individual node attribute modification
- **Name Validation**: Ensures unique and valid attribute names

### 🎨 Visual Effects
- **Particle System**: Animated background particles for atmosphere
- **Dynamic Lighting**: Ambient and directional lighting
- **Material Effects**: Emissive and metallic materials
- **Responsive Design**: Adapts to different screen sizes
- **Performance Optimized**: Efficient rendering and animations

### 📊 Interactive Controls
- **Physics Parameters**: Adjust attraction, repulsion, and damping
- **Node Configuration**: Change number of nodes and attributes
- **Central Node Selection**: Switch between different central nodes
- **Real-time Updates**: All changes apply immediately
- **Performance Monitoring**: FPS and memory usage tracking

## 🛠️ Technical Stack

- **Frontend**: Angular 18+ (Standalone Components)
- **3D Graphics**: Three.js with OrbitControls
- **Language**: TypeScript
- **Styling**: SCSS with responsive design
- **State Management**: RxJS Observables and Angular Signals
- **Build Tool**: Angular CLI with Vite

## 📋 Prerequisites

- Node.js (v18 or higher)
- npm (v9 or higher)
- Modern web browser with WebGL support

## 🏃‍♂️ Getting Started

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd Galaxy/spline-app
   ```

2. **Install dependencies**
```bash
npm install
```

3. **Start development server**
   ```bash
   npm start
   ```

4. **Open in browser**
   Navigate to `http://localhost:4200`

### Production Build

```bash
npm run build
```

The built files will be in the `dist/` directory.

## 🎮 How to Use

### Camera Controls

1. **Open Camera Menu**: Click the camera button (📷) in the top-right corner
2. **Select View**: Choose from the radial menu:
   - 🎮 **Free View**: Mouse controls enabled
   - ⬆️ **Top View**: Bird's eye perspective
   - 👁️ **Front View**: Direct front view
   - ↔️ **Side View**: Side perspective
   - 📐 **Isometric**: 3D diagonal view
   - 🔍 **Close Up**: Zoomed detail view

### Node Interactions

- **Drag Nodes**: Click and drag any node to move it
- **Hover Info**: Hover over nodes to see compatibility and attributes
- **Select Central**: Right-click any node to make it the central node
- **Edit Attributes**: Ctrl+Click to select for attribute editing

### Control Panel

Access the control panel to modify:

#### Basic Settings
- **Number of Nodes**: 3-20 nodes
- **Number of Attributes**: 3-10 attributes per node
- **Physics Forces**: Attraction and repulsion strength
- **Damping**: Movement damping factor

#### Node Management
- **Central Node Selection**: Choose which node is central
- **Central Preferences**: Set the central node's attribute values
- **Attribute Management**: Add, remove, or rename attributes

#### Advanced Features
- **Force Equilibrium**: Instantly move nodes to calculated positions
- **Generate Diverse Test**: Create varied node configurations
- **Reset to Defaults**: Restore original settings

### Attribute Management

#### Adding Attributes
1. Click "Add Attribute" button
2. Enter attribute name (max 30 characters)
3. Attribute appears with default value of 50

#### Editing Attributes
1. Select a node from the dropdown
2. Choose an attribute to edit
3. Use slider or number input to change value
4. Changes apply immediately

#### Removing Attributes
1. Select an attribute from the dropdown
2. Click "Remove" button
3. Confirm deletion (cannot be undone)

## 🔧 Console Commands

For debugging and advanced control, use these browser console commands:

### Camera Testing
```javascript
// Test specific camera view
testCameraViewFromConsole('top')
testCameraViewFromConsole('front')
testCameraViewFromConsole('side')
testCameraViewFromConsole('iso')
testCameraViewFromConsole('close')
testCameraViewFromConsole('free')

// Test all views automatically (2-second intervals)
testAllCameraViews()

// Direct camera control
testCamera('iso')
```

### Service Access
```javascript
// Access camera service
cameraService.getCurrentView()
cameraService.getCameraViews()

// Debug radial menu
debugRadialMenu()
```

## 📁 Project Structure

```
spline-app/
├── src/
│   ├── app/
│   │   ├── components/
│   │   │   ├── camera-view-control/     # Camera control UI
│   │   │   ├── galaxy-traits-library/   # Traits library component
│   │   │   └── spline-view/            # Main 3D visualization
│   │   ├── services/
│   │   │   ├── camera-view.service.ts   # Camera management
│   │   │   ├── node.service.ts         # Node data management
│   │   │   ├── physics.service.ts      # Physics calculations
│   │   │   └── spline-scene.service.ts # 3D scene management
│   │   ├── interfaces/
│   │   │   └── node.interface.ts       # TypeScript interfaces
│   │   └── data/
│   │       └── mock-data.ts            # Sample data generation
│   ├── Models/                         # 3D model assets
│   └── styles.scss                     # Global styles
├── public/                             # Static assets
└── README.md                          # This file
```

## 🔄 Core Components

### SplineViewComponent
Main visualization component that:
- Initializes Three.js scene
- Manages node positioning and physics
- Handles user interactions
- Renders particle effects

### CameraViewControlComponent
Camera control interface that:
- Provides radial menu for view selection
- Manages camera state
- Handles smooth transitions

### Services

#### CameraViewService
- Manages camera positions and states
- Handles view transitions
- Provides camera configuration

#### NodeService
- Manages node data and relationships
- Handles attribute updates
- Calculates compatibility scores

#### PhysicsService
- Computes node positioning
- Handles physics simulations
- Manages equilibrium calculations

## ⚡ Performance Features

- **Optimized Rendering**: Reduced polygon counts and efficient materials
- **Selective Updates**: Only updates changed elements
- **Performance Monitoring**: Real-time FPS and memory tracking
- **Responsive Particle System**: Adaptive particle count based on performance
- **Efficient Physics**: Equilibrium-based positioning reduces calculations

## 🎨 Customization

### Adding New Camera Views

1. **Update CameraViewService**:
```typescript
   private readonly cameraViews: CameraView[] = [
     // ... existing views
     {
       id: 'custom',
       name: 'Custom View',
       icon: '🎯',
       position: { x: 50, y: 50, z: 50 },
       target: { x: 0, y: 0, z: 0 },
       isFree: false,
       description: 'Custom camera view'
     }
];
```

### Modifying Physics Parameters

Adjust physics in `PhysicsService`:
```typescript
// Attraction force
attractionK: 100

// Repulsion force  
repulsionK: 20

// Movement damping
damping: 0.98
```

### Styling Customization

Main styles are in:
- `spline-view.component.scss` - 3D visualization styles
- `camera-view-control.component.ts` - Camera UI styles
- `styles.scss` - Global styles

## 🐛 Troubleshooting

### Common Issues

1. **Camera not responding**
   - Check browser console for errors
   - Try `testCamera('free')` in console
   - Refresh the page

2. **Performance issues**
   - Reduce number of nodes
   - Disable particles if needed
   - Check browser hardware acceleration

3. **Nodes not moving**
   - Click "Force Move to Equilibrium"
   - Try changing central node
   - Reset to defaults

### Debug Commands

```javascript
// Check camera state
cameraService.getCurrentView()

// Test camera functionality
testAllCameraViews()

// Check node data
// Available through component inspection
```

## 📊 Performance Guidelines

### Recommended Settings
- **Nodes**: 5-15 for optimal performance
- **Attributes**: 3-8 for best user experience
- **Particles**: Auto-adjusted based on performance

### Browser Compatibility
- Chrome 90+ (Recommended)
- Firefox 88+
- Safari 14+
- Edge 90+

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For issues and questions:
1. Check the troubleshooting section
2. Use browser console commands for debugging
3. Review component documentation
4. Open an issue on the repository

---

## 🎯 Quick Start Summary

1. **Install**: `npm install`
2. **Run**: `npm start`
3. **Open**: `http://localhost:4200`
4. **Explore**: Click the camera button and try different views!

Enjoy exploring your 3D Galaxy! 🌌✨