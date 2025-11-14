const { pool } = require('../config/database');

async function main() {
  try {
    console.log('=== MySQL LOCK DIAGNOSTICS ===');

    // 1) Processlist
    console.log('\n--- SHOW FULL PROCESSLIST ---');
    const [processes] = await pool.query('SHOW FULL PROCESSLIST');
    for (const p of processes) {
      const info = (p.Info || '').toString();
      console.log(
        `${p.Id}\tUser=${p.User}\tHost=${p.Host}\tDB=${p.Db}\tTime=${p.Time}\tState=${p.State}\tInfo=${info.substring(0, 200)}`
      );
    }

    // 2) InnoDB transactions
    console.log('\n--- information_schema.innodb_trx ---');
    try {
      const [trx] = await pool.query(`
        SELECT trx_id, trx_state, trx_started, trx_wait_started,
               trx_mysql_thread_id, trx_rows_locked, trx_rows_modified,
               trx_query
        FROM information_schema.innodb_trx
        ORDER BY trx_started
      `);
      if (trx.length === 0) {
        console.log('No active InnoDB transactions.');
      } else {
        for (const t of trx) {
          const q = (t.trx_query || '').toString();
          console.log(
            `${t.trx_id}\tstate=${t.trx_state}\tstarted=${t.trx_started}\twait_started=${t.trx_wait_started}\tthread=${t.trx_mysql_thread_id}\trows_locked=${t.trx_rows_locked}\trows_modified=${t.trx_rows_modified}\n  query=${q.substring(0, 200)}`
          );
        }
      }
    } catch (e) {
      console.log('Cannot query information_schema.innodb_trx:', e.message);
    }

    // 3) Optional: lock waits (if performance_schema enabled)
    console.log('\n--- performance_schema.data_lock_waits ---');
    try {
      const [waits] = await pool.query('SELECT * FROM performance_schema.data_lock_waits');
      if (!waits.length) {
        console.log('No lock waits currently recorded.');
      } else {
        for (const w of waits) {
          console.log(JSON.stringify(w));
        }
      }
    } catch (e) {
      console.log('Cannot query performance_schema.data_lock_waits:', e.message);
    }

    await pool.end();
  } catch (err) {
    console.error('diagnose-locks error:', err);
    process.exitCode = 1;
  }
}

main();
