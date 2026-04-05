import { GeoLanguageDetector } from '../utils/GeoLanguage'

async function testGeoLanguageDetection() {
    console.log('=== 地理位置和语言检测测试开始 ===\n')

    try {
        // 1. 测试地理位置检测
        console.log('1. 检测当前地理位置...')
        const location = await GeoLanguageDetector.getCurrentLocation()
        
        console.log('检测到的位置信息:')
        console.log(`  国家: ${location.country} (${location.countryCode})`)
        console.log(`  城市: ${location.city}`)
        console.log(`  时区: ${location.timezone}`)
        console.log(`  语言: ${location.language}`)
        console.log(`  货币: ${location.currency}`)
        console.log(`  IP: ${location.ip}\n`)

        // 2. 测试语言配置获取
        console.log('2. 获取语言配置...')
        const languageConfig = GeoLanguageDetector.getLanguageConfig(location.language)
        
        console.log(`语言配置: ${languageConfig.name} (${languageConfig.code})`)
        console.log(`Google Trends区域: ${languageConfig.googleTrendsLocale}`)
        console.log('搜索查询类别:')
        Object.entries(languageConfig.searchQueries).forEach(([category, queries]) => {
            console.log(`  ${category}: ${queries.slice(0, 3).join(', ')}${queries.length > 3 ? '...' : ''}`)
        })
        console.log('')

        // 3. 测试时效性查询生成
        console.log('3. 生成时效性搜索查询...')
        const timeBasedQueries = GeoLanguageDetector.generateTimeBasedQueries(location.language)
        
        console.log('基于当前时间的搜索查询:')
        timeBasedQueries.forEach((query, index) => {
            console.log(`  ${index + 1}. ${query}`)
        })
        console.log('')

        // 4. 测试多语言支持
        console.log('4. 测试多语言支持...')
        const testLanguages = ['ja', 'en', 'zh-CN']
        
        for (const lang of testLanguages) {
            const config = GeoLanguageDetector.getLanguageConfig(lang)
            const sampleQueries = config.searchQueries.news.slice(0, 2)
            console.log(`${config.name} (${lang}): ${sampleQueries.join(', ')}`)
        }
        console.log('')

        // 5. 测试时区检测和设置
        console.log('5. 测试时区检测和设置...')
        
        // 显示当前时区信息
        const timezoneInfo = GeoLanguageDetector.getTimezoneInfo()
        console.log('当前时区信息:')
        console.log(`  时区: ${timezoneInfo.current}`)
        console.log(`  偏移: ${timezoneInfo.offset}`)
        console.log(`  名称: ${timezoneInfo.name}`)
        console.log(`  夏令时: ${timezoneInfo.isDST ? '是' : '否'}`)
        console.log('')
        
        // 检查时区与地理位置是否匹配
        const timezoneMatch = await GeoLanguageDetector.checkTimezoneLocationMatch()
        console.log('时区地理位置匹配检查:')
        console.log(`  匹配状态: ${timezoneMatch.isMatched ? '✅ 匹配' : '❌ 不匹配'}`)
        console.log(`  当前时区: ${timezoneMatch.currentTimezone}`)
        console.log(`  检测时区: ${timezoneMatch.detectedTimezone}`)
        console.log(`  建议: ${timezoneMatch.recommendation}`)
        console.log('')
        
        // 如果时区不匹配，提供自动设置选项
        if (!timezoneMatch.isMatched) {
            console.log('6. 自动时区设置测试...')
            console.log('⚠️  检测到时区与地理位置不匹配，模拟自动设置...')
            
            // 注意：在测试中我们不真正更改时区，只是展示功能
            console.log(`模拟设置: ${timezoneMatch.currentTimezone} → ${timezoneMatch.detectedTimezone}`)
            console.log('(实际程序运行时会自动切换时区)')
            console.log('')
        }

        // 7. 显示配置建议
        console.log('7. 配置建议...')
        console.log('建议在config.json中启用以下设置:')
        console.log(JSON.stringify({
            searchSettings: {
                multiLanguage: {
                    enabled: true,
                    autoDetectLocation: true,
                    fallbackLanguage: 'en',
                    detectedLanguage: location.language,
                    detectedCountry: location.countryCode
                },
                autoTimezone: {
                    enabled: true,
                    setOnStartup: true,
                    validateMatch: true,
                    detectedTimezone: location.timezone
                }
            }
        }, null, 2))

    } catch (error) {
        console.error('❌ 测试过程中发生错误:', error)
        console.log('\n备用方案测试:')
        
        // 测试时区备用方案
        console.log('使用时区推测位置...')
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
        console.log(`当前时区: ${timezone}`)
        
        if (timezone.includes('Tokyo')) {
            console.log('检测到日本时区，建议使用日语搜索查询')
            const jaConfig = GeoLanguageDetector.getLanguageConfig('ja')
            console.log('日语搜索示例:', jaConfig.searchQueries.common.slice(0, 3).join(', '))
        } else if (timezone.includes('Shanghai')) {
            console.log('检测到中国时区，建议使用中文搜索查询')
            const zhConfig = GeoLanguageDetector.getLanguageConfig('zh-CN')
            console.log('中文搜索示例:', zhConfig.searchQueries.common.slice(0, 3).join(', '))
        } else {
            console.log('使用英语作为默认语言')
            const enConfig = GeoLanguageDetector.getLanguageConfig('en')
            console.log('英语搜索示例:', enConfig.searchQueries.common.slice(0, 3).join(', '))
        }
    }

    console.log('\n=== 测试完成 ===')
    console.log('现在程序将能够根据您的地理位置自动选择相应语言的搜索查询！')
    console.log('这将大幅提升反检测效果，让搜索行为更加自然。')
}

// 运行测试
testGeoLanguageDetection().catch(error => {
    console.error('测试失败:', error)
    process.exit(1)
}) 