package com.phlox.tvwebbrowser.browser

import java.util.Locale

/**
 * Sites whose fullscreen videos stay in their own player: a site of the list (or a subdomain of it) without a
 * setting of its own gets the site player, whatever the default
 * ([com.phlox.tvwebbrowser.Config.builtInPlayerByDefault]) is; the user can still choose the built-in player for it
 * in the site settings. Their videos play through Media Source Extensions or DRM, which the built-in player cannot take.
 */
object SitePlayerDefaults {
    /** Sites that play their videos themselves */
    private val SITES = setOf(
        "iqiyi.com", // iQiyi
        "v.qq.com", // Tencent Video
        "youku.com", // Youku
        "mgtv.com" // Mango TV
    )

    /** Whether the fullscreen videos of the [host] go to the site player by the list, null when it is not in it */
    fun builtInPlayer(host: String): Boolean? {
        var name = host.lowercase(Locale.ROOT).trimEnd('.')
        while (true) {
            if (name in SITES) return false
            val dot = name.indexOf('.')
            if (dot < 0) return null
            name = name.substring(dot + 1)
        }
    }
}
