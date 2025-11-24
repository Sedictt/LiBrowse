// Add Daily Check-in Settings
const { getConnection } = require('./config/database');

async function addSettings() {
    let connection;
    
    try {
        connection = await getConnection();
        console.log('✅ Database connection established');

        const settings = [
            {
                name: 'daily_checkin_reward_day_1_6',
                value: '5',
                description: 'Credits awarded for days 1-6 of daily check-in'
            },
            {
                name: 'daily_checkin_reward_day_7',
                value: '20',
                description: 'Bonus credits awarded for completing 7-day streak'
            },
            {
                name: 'daily_checkin_enabled',
                value: 'true',
                description: 'Enable or disable daily check-in system'
            },
            {
                name: 'daily_checkin_timezone_offset',
                value: '+08:00',
                description: 'Timezone offset for local day boundary (e.g., +08:00)'
            }
        ];

        for (const setting of settings) {
            await connection.execute(
                `INSERT INTO settings (setting_name, setting_val, description) 
                 VALUES (?, ?, ?) 
                 ON DUPLICATE KEY UPDATE setting_val = VALUES(setting_val)`,
                [setting.name, setting.value, setting.description]
            );
            console.log(`✅ Added/updated setting: ${setting.name}`);
        }

        console.log('\n✅ All settings configured successfully!');
        process.exit(0);

    } catch (error) {
        console.error('❌ Failed to add settings:', error.message);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

addSettings();
