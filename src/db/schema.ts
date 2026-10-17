import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core';

export const games = sqliteTable('games', {
  id: text('id').primaryKey(),
  status: text('status').notNull(),
  learning: text('learning').notNull().default('real'),
  note: text('note').notNull().default(''),
  title: text('title').notNull().default(''),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  state: text('state').notNull(),
});

export const events = sqliteTable('events', {
  gameId: text('game_id').notNull(),
  seq: integer('seq').notNull(),
  kind: text('kind').notNull(),
  payload: text('payload').notNull(),
}, (t) => [primaryKey({ columns: [t.gameId, t.seq] })]);

export const people = sqliteTable('people', {
  username: text('username').primaryKey(),
  name: text('name').notNull(),
  answers: text('answers').notNull().default('[]'),
  createdAt: integer('created_at').notNull(),
});

export const moves = sqliteTable('moves', {
  gameId: text('game_id').notNull(),
  playerId: text('player_id').notNull(),
  username: text('username').notNull().default(''),
  seq: integer('seq').notNull(),
  skill: text('skill'),
  points: integer('points').notNull(),
  rubric: integer('rubric').notNull(),
  round: integer('round'),
  why: text('why').notNull().default(''),
  source: text('source').notNull().default(''),
}, (t) => [primaryKey({ columns: [t.gameId, t.playerId, t.seq] }), index('moves_username_game').on(t.username, t.gameId)]);

export const playtests = sqliteTable('playtests', {
  id: text('id').primaryKey(),
  gameId: text('game_id').notNull(),
  report: text('report').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const meta = sqliteTable('meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
