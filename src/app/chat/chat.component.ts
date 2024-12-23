import { AfterViewInit, Component, ElementRef, ViewChild } from '@angular/core';
import { MatGridList, MatGridTile } from '@angular/material/grid-list';
import { MatButton } from '@angular/material/button';
import { WebSocketService } from '../service/websocket.service';
import { environment } from '../environment/environment';
import { Message } from '../types/message.interface';

 export const mediaConstraints = {
  audio: true,
  video: true
};

 export const offerOptions = {
  offerToReceiveAudio: true,
  offerToReceiveVideo: true
};

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [MatGridList, MatGridTile, MatButton],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.css'
})
export class ChatComponent implements AfterViewInit {
  @ViewChild('local_video') localVideo!: ElementRef;
  @ViewChild('received_video') remoteVideo!: ElementRef;

  private peerConnection!: RTCPeerConnection;
  private localStream!: MediaStream;

  inCall = false;
  localVideoActive = false;

  private readonly _destination = "/messages";

  constructor(private dataService: WebSocketService) { }

  async call(): Promise<void> {
    this.createPeerConnection();

    // Добавляем треки в PeerConnection
    this.addTracksToPeerConnection();

    try {
      const offer: RTCSessionDescriptionInit = await this.peerConnection.createOffer(offerOptions);
      // Устанавливаем локальное описание
      await this.peerConnection.setLocalDescription(offer);

      this.inCall = true;

      this.dataService.sendMessage(this._destination, { type: 'offer', data: offer });
    } catch (err: any) {
      this.handleGetUserMediaError(err);
    }
  }

  hangUp(): void {
    this.dataService.sendMessage(this._destination, { type: 'hangup', data: '' });
    this.closeVideoCall();
  }

  ngAfterViewInit(): void {
    this.requestLocalMediaDevices();
    this.addIncominMessageHandler();
  }

  private addIncominMessageHandler(): void {
    this.dataService.getMessages().subscribe(
      msg => {
        switch (msg.type) {
          case 'offer':
            this.handleOfferMessage(msg.data);
            break;
          case 'answer':
            this.handleAnswerMessage(msg.data);
            break;
          case 'hangup':
            this.handleHangupMessage(msg);
            break;
          case 'ice-candidate':
            this.handleICECandidateMessage(msg.data);
            break;
          default:
            console.log('unknown message of type ' + msg.type);
        }
      },
      error => console.log(error)
    );
  }

  private async handleOfferMessage(msg: RTCSessionDescriptionInit): Promise<void> {
    console.log('handle incoming offer');
    if (!this.peerConnection) {
      this.createPeerConnection();
    }

    if (!this.localStream) {
      await this.startLocalVideo();
    }

    try {
      const signalingState = this.peerConnection.signalingState;
      if (signalingState !== 'stable') {
        console.warn(`Cannot set remote description in state: ${signalingState}`);
        return;
      }

      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(msg));
      this.localVideo.nativeElement.srcObject = this.localStream; // ??

      this.addTracksToPeerConnection();

      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      this.dataService.sendMessage(this._destination, {
        type: 'answer',
        data: this.peerConnection.localDescription
      });

      this.inCall = true;
    } catch (error) {
      console.error('Error handling offer:', error);
    }
  }


  private async handleAnswerMessage(msg: RTCSessionDescriptionInit): Promise<void> {
    console.log('handle incoming answer');
    try {
      const signalingState = this.peerConnection.signalingState;
      if (signalingState !== 'have-local-offer') {
        console.warn(`Cannot set remote answer in state: ${signalingState}`);
        return;
      }

      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(msg));
    } catch (error) {
      console.error('Error handling answer:', error);
    }
  }

  private handleHangupMessage(msg: Message): void {
    console.log(msg);
    this.closeVideoCall();
  }

  private handleICECandidateMessage(msg: RTCIceCandidate): void {
    const candidate = new RTCIceCandidate(msg);
    this.peerConnection.addIceCandidate(candidate).catch(this.reportError);
  }

  private async requestLocalMediaDevices(): Promise<void> {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
      this.pauseLocalVideo();
    } catch (e: any) {
      console.error(e);
      alert(`getUserMedia() error: ${e.name}`);
    }
  }

  startLocalVideo(): void {
    console.log('starting local stream');
    this.localStream.getTracks().forEach(track => {
      track.enabled = true;
    });
    this.localVideo.nativeElement.srcObject = this.localStream;

    this.localVideoActive = true;
  }

  pauseLocalVideo(): void {
    console.log('pause local stream');
    this.localStream.getTracks().forEach(track => {
      track.enabled = false;
    });
    this.localVideo.nativeElement.srcObject = undefined;

    this.localVideoActive = false;
  }

  private createPeerConnection(): void {
    console.log('creating PeerConnection...');
    this.peerConnection = new RTCPeerConnection(environment.RTCPeerConfiguration);

    this.peerConnection.onicecandidate = this.handleICECandidateEvent;
    this.peerConnection.oniceconnectionstatechange = this.handleICEConnectionStateChangeEvent;
    this.peerConnection.onsignalingstatechange = this.handleSignalingStateChangeEvent;
    this.peerConnection.ontrack = this.handleTrackEvent;
  }

  private addTracksToPeerConnection(): void {
    const existingSenders = this.peerConnection.getSenders();
    this.localStream.getTracks().forEach(track => {
      const sender = existingSenders.find(sndr => sndr.track === track);
      if (!sender) {
        this.peerConnection.addTrack(track, this.localStream);
      }
    });
  }

  private closeVideoCall(): void {
    console.log('Closing call');
    if (this.peerConnection) {
      console.log('--> Closing the peer connection');

      this.peerConnection.ontrack = null;
      this.peerConnection.onicecandidate = null;
      this.peerConnection.oniceconnectionstatechange = null;
      this.peerConnection.onsignalingstatechange = null;

      this.peerConnection.getTransceivers().forEach(transceiver => {
        transceiver.stop();
      });

      this.peerConnection.close();

      this.inCall = false;
    }
  }

  private handleGetUserMediaError(e: Error): void {
    switch (e.name) {
      case 'NotFoundError':
        alert('Unable to open your call because no camera and/or microphone were found.');
        break;
      case 'SecurityError':
      case 'PermissionDeniedError':
        break;
      default:
        console.log(e);
        alert('Error opening your camera and/or microphone: ' + e.message);
        break;
    }

    this.closeVideoCall();
  }

  private reportError = (e: Error) => {
    console.log('got Error: ' + e.name);
    console.log(e);
  }

  private handleICECandidateEvent = (event: RTCPeerConnectionIceEvent) => {
    if (event.candidate) {
      this.dataService.sendMessage(this._destination, {
        type: 'ice-candidate',
        data: event.candidate
      });
    }
  }

  private handleICEConnectionStateChangeEvent = (event: Event) => {
    switch (this.peerConnection.iceConnectionState) {
      case 'closed':
      case 'failed':
      case 'disconnected':
        this.closeVideoCall();
        break;
    }
  }

  private handleSignalingStateChangeEvent = (event: Event) => {
    switch (this.peerConnection.signalingState) {
      case 'closed':
        this.closeVideoCall();
        break;
    }
  }

  private handleTrackEvent = (event: RTCTrackEvent) => {
    this.remoteVideo.nativeElement.srcObject = event.streams[0];
  }
}
