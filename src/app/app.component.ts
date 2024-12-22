import { Component } from '@angular/core';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import {ChatComponent} from './chat/chat.component';

@Component({
  selector: 'app-root',
  imports: [MatSidenavModule, MatToolbarModule, ChatComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'webrtc-study-proj';
}
