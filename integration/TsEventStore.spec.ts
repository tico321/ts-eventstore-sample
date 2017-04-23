import 'mocha';
import * as chai from 'chai';
chai.should();

import { TsEventStore } from 'ts-eventstore/TsEventStore';
import { CommandStream } from 'ts-eventstore/CommandStream';
import { CommandMessage } from 'ts-eventstore/CommandMessage';
import { EventMessage } from 'ts-eventstore/EventMessage';
import { EventStream } from 'ts-eventstore/EventStream';
import { IDomainEvent } from 'ts-eventstore/IDomainEvent';
import * as http from 'http';
import { MongoContext } from 'ts-eventstore-mongodb/MongoContext';
import { SocketIOServerProxyFactory } from 'ts-eventstore-socketio/SocketIOServerProxyFactory';
import { SocketIOServerFactory } from 'ts-eventstore-socketio/SocketIOServerFactory';
import 'rxjs/add/operator/bufferCount';
import * as socketio from 'socket.io';
import * as io from 'socket.io-client';

/* tslint:disable:no-magic-numbers */
describe('Composition Root Integration', () => {
  const mongoUrl = 'mongodb://localhost:27017/ts_eventstore_integration_test';
  const httpServer = http.createServer((req, res) => {
    res.end();
  });
  const messageConfig = {
    http: httpServer,
    port: 2017,
    address: 'http://localhost',
    reconnect: false
  };

  describe.skip('Command streams', () => {
    it('subscriber creates the command streams in such a way that they receive updates when the ' +
      'command handlers are invoked.', (done) => {

      const commandName = 'testCommand';
      const data = 'data';
      const message = new CommandMessage(commandName, data);
      const context = new MongoContext({connectionString: mongoUrl});
      const socket = io.connect(
        `${messageConfig.address}:${messageConfig.port}`,
        {reconnection: messageConfig.reconnect || true});
      const subscriber = TsEventStore.getSubscriber(new SocketIOServerProxyFactory(socket));
      const publisher = TsEventStore.getPublisher(
        context,
        new SocketIOServerFactory(socketio(messageConfig.http)));
      publisher.start();
      httpServer.listen(messageConfig.port);

      subscriber.connect();

      subscriber.getCommandStream(commandName)
        .subscribe(
          (stream : CommandStream) => {
            chai.assert.isNotNull(stream);
            chai.assert.equal(stream.command.name, commandName);
            chai.assert.equal(stream.command.data, data);
            done();
          },
          err => done(err));

      subscriber.invokeHandlers(message);
    });
  });

  describe.skip('Event streams', () => {
    it('subscriber creates the event streams in such a way that they receive updates when the ' +
      'an event raiser raises an event plus they are stored in the db.', (done) => {

      const commandName = 'testCommand';
      const eventName = 'eventTest';
      const data = 'data';
      const message = new CommandMessage(commandName, data);
      const aggregateId = +new Date();
      const eventMessage = new EventMessage(
        eventName,
        'eventData',
        aggregateId,
        0);
      const socket = io.connect(
        `${messageConfig.address}:${messageConfig.port}`,
        {reconnection: messageConfig.reconnect || true});
      const context = new MongoContext({connectionString: mongoUrl});
      const subscriber = TsEventStore.getSubscriber(new SocketIOServerProxyFactory(socket));
      const publisher = TsEventStore.getPublisher(
        context,
        new SocketIOServerFactory(socketio(messageConfig.http)));
      publisher.start();
      httpServer.listen(messageConfig.port);
      subscriber.connect();
      subscriber.getCommandStream(commandName)
        .subscribe(
          (stream : CommandStream) => {
            stream.eventRaiser.raiseEvent(eventMessage);
          },
          err => done(err));
      subscriber.getEventStream(eventName)
        .subscribe(
          (stream : EventStream) => {
            chai.assert.equal(stream.event.data, 'eventData');
            chai.assert.notEqual(stream.event.id, 0);
            done();
          },
          err => done(err));
      subscriber.invokeHandlers(message);
    });
  });

  describe.skip('Query events', () => {
    it('Returns all the events for an aggregate root', (done) => {
      const socket = io.connect(
        `${messageConfig.address}:${messageConfig.port}`,
        {reconnection: messageConfig.reconnect || true});
      const context = new MongoContext({connectionString: mongoUrl});
      const subscriber = TsEventStore.getSubscriber(new SocketIOServerProxyFactory(socket));
      const publisher = TsEventStore.getPublisher(
        context,
        new SocketIOServerFactory(socketio(messageConfig.http)));
      publisher.start();
      httpServer.listen(messageConfig.port);
      subscriber.connect();

      const commandName = 'testCommand';
      const data = 'data';
      const message = new CommandMessage(commandName, data);
      const eventName = 'eventTest';
      const aggregateId = +new Date();
      const eventMessage1 = new EventMessage(
        eventName, 'eventData1', aggregateId, 0);
      const eventMessage2 = new EventMessage(
        eventName, 'eventData2', aggregateId, 0);

      subscriber.getCommandStream(commandName)
        .subscribe(
          (stream : CommandStream) => {
            stream.eventRaiser.raiseEvent(eventMessage1);
            stream.eventRaiser.raiseEvent(eventMessage2);
          },
          err => done(err));
      subscriber.getEventStream(eventName)
        .bufferCount(2)
        .subscribe(
          (streams : EventStream[]) => {
            chai.assert.equal(streams.length, 2);
            streams[0].domainEvents.all(streams[0].event.aggregateId)
              .bufferCount(2)
              .subscribe(
                (events : IDomainEvent[]) => {
                  chai.assert.equal(events.length, 2);
                  chai.assert.equal(events[0].data, eventMessage1.data);
                  chai.assert.equal(events[1].data, eventMessage2.data);
                  done();
                },
                err => done(err));
          },
          err => done(err));

      subscriber.invokeHandlers(message);
    });
  });

});