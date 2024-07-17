/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema
    .createTable('crawler', function (table) {
      table.bigIncrements('id')
      table.text('root_path').notNullable().unique()
      table.string('status', 10).notNullable().defaultTo('idle')
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
    })
    .createTable('link', function (table) {
      table.bigIncrements('id')
      table.text('path').notNullable()
      table.string('status', 10).notNullable().defaultTo('fresh')
      table.bigInteger('crawler_id').notNullable()
      table.foreign('crawler_id').references('crawler.id')
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
    })
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTable('link').dropTable('crawler')
}
