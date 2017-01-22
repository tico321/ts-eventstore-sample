import 'mocha';
import * as chai from 'chai';
chai.should();

import { TsEventStore } from 'ts-eventstore/TsEventStore';
import { CommandStream } from 'ts-eventstore/messages/CommandStream';
import { CommandMessage } from 'ts-eventstore/messages/CommandMessage';
import { EventMessage } from 'ts-eventstore/messages/EventMessage';
import { EventStream } from 'ts-eventstore/messages/EventStream';
import { IDomainEvent } from 'ts-eventstore/data/IDomainEvent';
import * as http from 'http';
import { MongoContext } from 'ts-eventstore-mongodb/MongoContext';
import { Messaging } from 'ts-eventstore-socketio/Messaging';
import 'rxjs/add/operator/bufferCount';

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

  describe('Command streams', () => {
    it('bus creates the command streams in such a way that they receive updates when the ' +
      'command handlers are invoked.', (done) => {

      const commandName = 'testCommand';
      const data = 'data';
      const message = new CommandMessage(commandName, data);
      const eventStore = TsEventStore.bootstrap({
        messaging: Messaging(messageConfig),
        context: new MongoContext({connectionString: mongoUrl})
      });
      const bus = eventStore.bus;
      const server = eventStore.server;
      server.start();
      httpServer.listen(messageConfig.port);
      bus.connect();

      bus.getCommandStream(commandName)
        .subscribe(
          (stream : CommandStream) => {
            chai.assert.isNotNull(stream);
            chai.assert.equal(stream.command.name, commandName);
            chai.assert.equal(stream.command.data, data);
            done();
          },
          err => done(err));

      bus.invokeHandlers(message);
    });
  });

  describe('Event streams', () => {
    it('bus creates the event streams in such a way that they receive updates when the ' +
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
      const eventStore = TsEventStore.bootstrap({
        context: new MongoContext({connectionString: mongoUrl}),
        messaging: Messaging(messageConfig),
      });
      const bus = eventStore.bus;
      const server = eventStore.server;
      server.start();
      httpServer.listen(messageConfig.port);
      bus.connect();
      bus.getCommandStream(commandName)
        .subscribe(
          (stream : CommandStream) => {
            stream.raiser.raiseEvent(eventMessage);
          },
          err => done(err));
      bus.getEventStream(eventName)
        .subscribe(
          (stream : EventStream) => {
            chai.assert.equal(stream.event.data, 'eventData');
            chai.assert.notEqual(stream.event.id, 0);
            done();
          },
          err => done(err));
      bus.invokeHandlers(message);
    });
  });

  describe('Query events', () => {
    it('Returns all the events for an aggregate root', (done) => {
      const commandName = 'testCommand';
      const eventName = 'eventTest';
      const data = 'data';
      const message = new CommandMessage(commandName, data);
      const aggregateId = +new Date();
      const eventMessage1 = new EventMessage(
        eventName, 'eventData1', aggregateId, 0);
      const eventMessage2 = new EventMessage(
        eventName, 'eventData2', aggregateId, 0);
      const eventStore = TsEventStore.bootstrap({
        context: new MongoContext({connectionString: mongoUrl}),
        messaging: Messaging(messageConfig),
      });
      const bus = eventStore.bus;
      const server = eventStore.server;
      server.start();
      httpServer.listen(messageConfig.port);
      bus.connect();
      bus.getCommandStream(commandName)
        .subscribe(
          (stream : CommandStream) => {
            stream.raiser.raiseEvent(eventMessage1);
            stream.raiser.raiseEvent(eventMessage2);
          },
          err => done(err));
      bus.getEventStream(eventName)
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
      bus.invokeHandlers(message);
    });
  });

});