import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SplineViewComponent } from './components/spline-view/spline-view.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, SplineViewComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'spline-app';
}
