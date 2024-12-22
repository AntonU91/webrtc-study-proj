import {Component, ElementRef, inject, ViewChild} from '@angular/core';
import {MatGridList, MatGridTile} from '@angular/material/grid-list';
import {environment} from '../environment/environment';
import {WebSocketService} from '../service/websocket.service';

export const mediaConstraints = {
  audio: true,
  video: {width: 1280, height: 720}
};

export const offerOptions = {
  offerToReceiveAudio: true,
  offerToReceiveVideo: true
};

@Component({
  selector: 'app-chat',
  imports: [
    MatGridList,
    MatGridTile
  ],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.css',
  standalone: true
})
export class ChatComponent {
  private localStream!: MediaStream;
  @ViewChild('local_video') localVideo!: ElementRef<HTMLVideoElement>;
  @ViewChild('received_video') remoteVideo!: ElementRef<HTMLVideoElement>;
  private webSocketService: WebSocketService = inject(WebSocketService);
  private peerConnection!: RTCPeerConnection; // reference to the remote party

  ngAfterViewInit(): void {
    this.addIncomingMessageHandler();
    this.requestMediaDevices();
  }

  private async requestMediaDevices(): Promise<void> {
    this.localStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
    this.localVideo.nativeElement.srcObject = this.localStream;
    this.pauseLocalVideo();
  }

  protected pauseLocalVideo() {
    this.localStream.getTracks()
      .forEach(track => track.enabled = false);
    this.localVideo.nativeElement.srcObject = null;
  }

  protected startLocalVideo() {
    this.localStream.getTracks()
      .forEach(track => track.enabled = true);
    this.localVideo.nativeElement.srcObject = this.localStream;
    this.addTracksToPeerConnection();
  }

  private readonly _destination = "/messages";

  async call(): Promise<void> {
    this.createPeerConnection();
    this.addTracksToPeerConnection();

    try {
      const offer: RTCSessionDescriptionInit = await this.peerConnection.createOffer(offerOptions);
      await this.peerConnection.setLocalDescription(offer);

      this.webSocketService.sendMessage(this._destination, {type: "offer", data: offer});
    } catch (err: any) {
      this.handleGetUserMediaError(err);
    }
  }

  private createPeerConnection() {
    this.peerConnection = new RTCPeerConnection(environment.RTCPeerConfiguration);

    this.peerConnection.onicecandidate = this.handleICECandidateEvent;
    this.peerConnection.oniceconnectionstatechange = this.handleICEConnectionStateChangeEvent;
    this.peerConnection.onsignalingstatechange = this.handleSignalingStateChangeEvent;
    this.peerConnection.ontrack = this.handleTrackEvent;
  }

  private addTracksToPeerConnection() {
    const existingTracks = this.peerConnection.getSenders().map(sender => sender.track);
    this.localStream.getTracks().forEach(track => {
      if (!existingTracks.includes(track)) {
        this.peerConnection.addTrack(track, this.localStream);
      }
    });
  }

  private closeVideoCall(): void {
    if (this.peerConnection) {
      this.peerConnection.onicecandidate = null;
      this.peerConnection.oniceconnectionstatechange = null;
      this.peerConnection.onsignalingstatechange = null;
      this.peerConnection.ontrack = null;
    }
    this.peerConnection.getTransceivers()
      .forEach(transceiver => transceiver.stop());
    this.peerConnection.close();
  }

  private handleGetUserMediaError(e: Error) {
    switch (e.name) {
      case 'NotFoundError':
        alert('Unable to open your call because no camera and/or microphone were found.');
        break;
      case 'SecurityError':
      case 'PermissionDeniedError':
        // Do nothing; this is the same as the user canceling the call.
        break;
      default:
        console.log(e);
        alert('Error opening your camera and/or microphone: ' + e.message);
        break;
    }
    this.closeVideoCall();
  }

  /* ########################  EVENT HANDLER  ################################## */
  private handleICECandidateEvent = (event: RTCPeerConnectionIceEvent) => {
    console.log(event);
    if (event.candidate) {
      this.webSocketService.sendMessage(this._destination, {
        type: 'ice-candidate',
        data: event.candidate
      });
    }
  }

  private handleICEConnectionStateChangeEvent = (event: Event) => {
    console.log(event);
    switch (this.peerConnection.iceConnectionState) {
      case 'closed':
      case 'failed':
      case 'disconnected':
        this.closeVideoCall();
        break;
    }
  }

  private handleSignalingStateChangeEvent = (event: Event) => {
    console.log(event);
    switch (this.peerConnection.signalingState) {
      case 'closed':
        this.closeVideoCall();
        break;
    }
  }

  private handleTrackEvent = (event: RTCTrackEvent) => {
    console.log(event);
    this.remoteVideo.nativeElement.srcObject = event.streams[0];
  }

  private addIncomingMessageHandler() {
    this.webSocketService.getMessages()
      .subscribe(msg => {
          console.log(" Get message of type: " + msg.type);
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
            case 'icecandidates':
              this.handleICECandidatesMessage(msg.data);
              break;
            default:
              console.log("unknown message of type" + msg.type);
          }
        },
        error => console.log(error));
  }

  private handleOfferMessage(msg: RTCSessionDescriptionInit) {
    if (!this.peerConnection) {
      this.createPeerConnection();
    }
    if (!this.localStream) {
      this.startLocalVideo();
    }
    this.peerConnection.setRemoteDescription(new RTCSessionDescription(msg))
      .then(() => this.addTracksToPeerConnection())
      .then(() => this.peerConnection.createAnswer())
      .then(answer => this.peerConnection.setLocalDescription(answer))
      .then(() => {
        this.webSocketService.sendMessage(this._destination, {type: "answer", data: this.peerConnection.localDescription});
      })
      .catch(this.handleGetUserMediaError);
  }

  private handleAnswerMessage(data: any) {
    this.peerConnection.setRemoteDescription(data);
  }

  private handleHangupMessage(message: any) {
    this.closeVideoCall();
  }

  private handleICECandidatesMessage(data: any) {
    this.peerConnection.addIceCandidate(data).catch(this.reportError);
  }

  private reportError = (err: Error) => {
    console.log("got Error: " + err.name);
    console.log(err);
  }

  hangUp() {
    this.webSocketService.sendMessage(this._destination, {type: "hangup", data: ''});
    this.closeVideoCall();
  }
}
