# Galaxy Traits Visualization Library

A powerful 3D visualization library for interactive trait-based relationship mapping using Three.js and Angular. This library creates a solar-system-style visualization where nodes represent people or entities, and their relationships are determined by trait compatibility.

## Features

### 🎨 Visual Design
- **Dark Neomorphic Theme** with neon purple/pink accents
- **Animated Starfield Background** with floating particles
- **Radial UI Elements** positioned around the central person
- **Glass Morphism Effects** with backdrop blur
- **Neon Glow Animations** and hover effects

### 🔧 Interactive Features
- **Draggable Nodes** - Click and drag nodes to reposition them
- **Hover Tooltips** - Detailed information on node hover
- **Central Node Selector** - Click radial elements to change the central person
- **Real-time Physics Simulation** - Nodes attract/repel based on trait compatibility
- **Configurable Controls** - Adjust physics parameters, node count, and attributes

### ⚡ Performance
- **High-Performance Simulation** with optimized Three.js rendering
- **Particle System** with 1000+ animated particles
- **Smooth 60fps Animation** with requestAnimationFrame
- **Responsive Design** that works on all screen sizes

## Installation

```bash
npm install
```

## Usage

### Basic Usage

```typescript
import { GalaxyTraitsLibraryComponent, GalaxyNode, GalaxyConfig } from './components/galaxy-traits-library/galaxy-traits-library.component';

// In your component
export class MyComponent {
  config: GalaxyConfig = {
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

  nodes: GalaxyNode[] = [
    {
      id: 'person1',
      name: 'Alice',
      description: 'Software Engineer',
      attributes: [80, 60, 90]
    },
    // ... more nodes
  ];

  onNodeSelected(node: GalaxyNode) {
    console.log('Selected node:', node);
  }

  onConfigChanged(config: GalaxyConfig) {
    console.log('Config updated:', config);
  }
}
```

```html
<galaxy-traits-library 
  [config]="config"
  [nodes]="nodes"
  (nodeSelected)="onNodeSelected($event)"
  (configChanged)="onConfigChanged($event)">
</galaxy-traits-library>
```

### Configuration Options

#### GalaxyConfig Interface

```typescript
interface GalaxyConfig {
  numNodes: number;           // Number of nodes to display (3-20)
  numAttributes: number;      // Number of attributes per node (3-10)
  attractionK: number;        // Attraction force strength (0-100)
  repulsionK: number;         // Repulsion force strength (0-100)
  damping: number;            // Velocity damping (0.8-1.0)
  centralPreferences: number[]; // Central person's trait preferences
  showControls: boolean;      // Show/hide control panel
  theme: 'dark' | 'light';    // Visual theme
  particleCount: number;      // Number of background particles
}
```

#### GalaxyNode Interface

```typescript
interface GalaxyNode {
  id: string;                 // Unique identifier
  name: string;               // Display name
  description: string;        // Tooltip description
  attributes: number[];       // Trait values (0-100)
  position?: Vector3;         // Optional 3D position
}
```

## Physics Simulation

The library uses a sophisticated physics simulation to determine node relationships:

### Attraction Forces
- Nodes are attracted to the center based on trait compatibility
- Compatibility is calculated using the difference between central preferences and node attributes
- Higher compatibility = stronger attraction

### Repulsion Forces
- Nodes repel each other based on trait dissimilarity
- Similar nodes stay closer together
- Dissimilar nodes push each other away

### Damping
- Velocity damping prevents infinite acceleration
- Creates natural, stable movement patterns

## Customization

### Styling
The library uses CSS custom properties for easy theming:

```scss
:host {
  --neon-purple: #C300FF;
  --neon-pink: #FF3366;
  --neon-cyan: #00FFFF;
  --neon-blue: #0080FF;
  --dark-bg: #0A0A0A;
  --card-bg: rgba(20, 20, 20, 0.8);
  --glass-bg: rgba(255, 255, 255, 0.05);
  --text-primary: #FFFFFF;
  --text-secondary: rgba(255, 255, 255, 0.7);
}
```

### Radial UI Elements
The radial UI elements can be customized by modifying the `nodeData` array in the main component:

```typescript
nodeData = [
  { id: 'biology', name: 'Programmable Biology', description: '...' },
  { id: 'web3', name: 'Scenius Web3', description: '...' },
  // Add more elements as needed
];
```

## Development

### Running the Application

```bash
npm start
```

The application will be available at `http://localhost:4200`.

### Building for Production

```bash
npm run build
```

## API Reference

### Events

- `nodeSelected`: Emitted when a node is clicked
- `configChanged`: Emitted when configuration is updated

### Methods

- `updateConfig(newConfig: Partial<GalaxyConfig>)`: Update configuration
- `showTooltip(x, y, title, content)`: Show tooltip at coordinates
- `hideTooltip()`: Hide current tooltip

## Browser Support

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Support

For issues and questions, please open an issue on GitHub.