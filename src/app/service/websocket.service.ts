import { Injectable } from '@angular/core';
import {Client, IStompSocket} from '@stomp/stompjs';
import { BehaviorSubject, Observable } from 'rxjs';
import SockJS from 'sockjs-client';
import {Message} from '../types/message.interface';

@Injectable({
  providedIn: 'root',
})

export class WebSocketService {
  private readonly client: Client;
  private messages$: BehaviorSubject<Message> = new BehaviorSubject<Message>({type: '', data: ''});

  constructor() {
    this.client = new Client({
      brokerURL: 'ws://localhost:8080/ws', // URL вашего STOMP веб-сокета
      reconnectDelay: 5000, // Автоматическая попытка подключения
      debug: (str) => console.log(str),
      onConnect: () => this.onConnect(),
    });

    this.client.webSocketFactory = () => new SockJS('http://localhost:8080/ws') as unknown as IStompSocket;
    this.client.activate();
  }

  private onConnect(): void {
    // Подписка на сообщения
    this.client.subscribe('/topic/messages', (message) => {
      if (message.body) {
        this.messages$.next(message as unknown as Message);
      }
    });
  }

  sendMessage(destination: string, body: Message): void {
    this.client.publish({ destination: `/app${destination}`, body: JSON.stringify(body) });
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
