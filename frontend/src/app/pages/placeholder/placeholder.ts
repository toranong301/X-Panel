import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-placeholder',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './placeholder.html',
  styleUrls: ['./placeholder.scss'],
})
export class PlaceholderPageComponent {
  constructor(private route: ActivatedRoute) {}

  get title(): string {
    return this.route.snapshot.data['title'] ?? 'Coming soon';
  }

  get description(): string {
    return this.route.snapshot.data['description'] ?? 'This section is under construction.';
  }

  get slug(): string {
    return this.route.snapshot.paramMap.get('slug') ?? '';
  }
}
