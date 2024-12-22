import { Injectable } from '@angular/core';
import { Client, IStompSocket } from '@stomp/stompjs';
import { BehaviorSubject, Observable } from 'rxjs';
import SockJS from 'sockjs-client';
import { Message } from '../types/message.interface';

@Injectable({
  providedIn: 'root',
})
export class WebSocketService {
  private readonly client: Client;
  private messages$: BehaviorSubject<Message> = new BehaviorSubject<Message>({ type: '', data: '' });

  constructor() {
    this.client = new Client({
      reconnectDelay: 5000,
      debug: (str) => console.log(str),
      onConnect: () => this.onConnect(),
    });

    this.client.webSocketFactory = () => new WebSocket('ws://localhost:8080/ws') as unknown as IStompSocket;
    this.client.activate();
  }

  private onConnect(): void {
    console.log("Subscribe to '/topic/messages'");
    this.client.subscribe('/topic/messages', (message) => {
      try {
        if (message.body) {
          const parsedMessage = JSON.parse(message.body) as Message;
          this.messages$.next(parsedMessage);
        }
      } catch (error) {
        console.error('Failed to process incoming message:', error);
      }
    });
  }

  sendMessage(destination: string, body: Message): void {
    try {
      this.client.publish({ destination: `/app${destination}`, body: JSON.stringify(body) });
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  }

  getMessages(): Observable<Message> {
    return this.messages$.asObservable();
  }

  disconnect(): void {
    if (this.client) {
      this.client.deactivate();
    }
  }
}
