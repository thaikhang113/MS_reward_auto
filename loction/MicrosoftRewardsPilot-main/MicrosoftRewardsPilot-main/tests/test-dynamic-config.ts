import { loadAccounts, loadConfig, refreshAllConfigs, clearConfigCache, clearAccountsCache } from '../utils/Load'

/**
 * 测试动态配置加载功能
 */
async function testDynamicConfig() {
    console.log('=== 动态配置加载测试开始 ===\n')

    try {
        // 1. 初始加载
        console.log('1. 初始加载配置文件...')
        const initialConfig = loadConfig()
        const initialAccounts = loadAccounts()
        
        console.log(`配置加载完成 - clusters: ${initialConfig.clusters}, headless: ${initialConfig.headless}`)
        console.log(`账户加载完成 - 共 ${initialAccounts.length} 个账户`)
        console.log(`第一个账户邮箱: ${initialAccounts[0]?.email || 'N/A'}`)

        // 2. 显示缓存状态
        console.log('\n2. 再次调用加载函数（应使用缓存）...')
        loadConfig() // 使用缓存
        loadAccounts() // 使用缓存
        console.log('缓存配置获取成功')

        // 3. 手动刷新缓存
        console.log('\n3. 手动清除缓存...')
        clearConfigCache()
        clearAccountsCache()

        // 4. 重新加载
        console.log('\n4. 清除缓存后重新加载...')
        const reloadedConfig = loadConfig()
        const reloadedAccounts = loadAccounts()
        console.log(`重新加载完成 - clusters: ${reloadedConfig.clusters}, 账户数: ${reloadedAccounts.length}`)

        // 5. 使用刷新所有配置功能
        console.log('\n5. 测试刷新所有配置功能...')
        refreshAllConfigs()
        console.log('所有配置已刷新')

        console.log('\n=== 测试完成 ===')
        console.log('\n注意: 现在您可以修改 accounts.json 或 config.json 文件，')
        console.log('文件监听器会自动检测变化并重新加载配置。')
        console.log('\n保持此脚本运行状态，然后修改配置文件来测试热重载功能...')
        
        // 保持脚本运行以便测试文件监听
        console.log('\n按 Ctrl+C 退出测试')
        
        // 保持进程运行
        setInterval(() => {
            // 每30秒显示一次当前配置状态
            try {
                const currentConfig = loadConfig()
                const currentAccounts = loadAccounts()
                console.log(`\n[${new Date().toISOString()}] 当前状态检查:`)
                console.log(`- 配置集群数: ${currentConfig.clusters}`)
                console.log(`- 账户数量: ${currentAccounts.length}`)
                console.log(`- 无头模式: ${currentConfig.headless}`)
            } catch (error) {
                console.error('状态检查出错:', error)
            }
        }, 30000)

    } catch (error) {
        console.error('测试过程中出现错误:', error)
        process.exit(1)
    }
}

// 优雅退出处理
process.on('SIGINT', () => {
    console.log('\n\n收到退出信号，测试结束。')
    process.exit(0)
})

process.on('SIGTERM', () => {
    console.log('\n\n收到终止信号，测试结束。')
    process.exit(0)
})

// 运行测试
if (require.main === module) {
    testDynamicConfig()
}

export { testDynamicConfig } 