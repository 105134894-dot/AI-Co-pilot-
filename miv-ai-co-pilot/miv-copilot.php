<?php
/**
 * Plugin Name: MIV AI Co-Pilot
 * Description: Adds the custom AI Accessibility Co-Pilot widget to the footer of the website.
 * Version: 1.0
 * Author:
 */

if (!defined('ABSPATH')) {
    exit;
}

require_once plugin_dir_path(__FILE__) . 'includes/admin-pages.php';

/**
 * Enqueue CSS and JS for the widget
 */
function miv_enqueue_copilot_assets() {
    $plugin_url = plugin_dir_url(__FILE__);
    $plugin_dir = plugin_dir_path(__FILE__);

    // CSS (cache-busted)
    wp_enqueue_style(
        'miv-copilot-style',
        $plugin_url . 'assets/css/miv-widget.css',
        array(),
        filemtime($plugin_dir . 'assets/css/miv-widget.css')
    );

    // JS (cache-busted)
    wp_enqueue_script(
        'miv-copilot-script',
        $plugin_url . 'assets/js/miv-widget.js',
        array(),
        filemtime($plugin_dir . 'assets/js/miv-widget.js'),
        true // load in footer
    );

    // Pass config to JS
    wp_localize_script(
        'miv-copilot-script',
        'MIV_WIDGET_CONFIG',
        array(
            'backendUrl'      => 'https://ict30018-project-b-ai-co-pilot.onrender.com',
            'storageVersion'  => (string) filemtime($plugin_dir . 'assets/js/miv-widget.js'), // changes when file changes
        )
    );
}
add_action('wp_enqueue_scripts', 'miv_enqueue_copilot_assets');

/**
 * Output the widget HTML in the footer
 */
function miv_inject_copilot_widget() {
    // NOTE: keep these paths consistent with your plugin structure.
    // If your images are stored at /assets/img/, change 'img/' to 'assets/img/' below.
    $button_img = plugins_url('img/miv-button.png', __FILE__);
    $logo_img   = plugins_url('img/miv-logo.jpg', __FILE__);
    ?>
    <div class="miv-widget-root" id="miv-widget-root">
        <button
            class="miv-launcher-btn"
            id="miv-launcher-btn"
            aria-label="Open MIV AI Co-Pilot"
        >
            <img
                src="<?php echo esc_url($button_img); ?>"
                alt="Open AI Co-Pilot"
                class="miv-launcher-img"
            />
        </button>

        <div
            class="miv-chat-window"
            id="miv-chat-window"
            role="dialog"
            aria-modal="true"
            aria-hidden="true"
        >
            <header class="miv-chat-header">
                <div class="miv-header-left">
                    <img
                        src="<?php echo esc_url($logo_img); ?>"
                        alt="MIV logo"
                        class="miv-logo"
                    />
                </div>

                <div class="miv-header-title">AI Co-Pilot</div>

                <button class="miv-a11y-toggle" id="miv-a11y-toggle" aria-label="Accessibility options">
                    ♿
                </button>

                <button class="miv-close-btn" id="miv-close-btn" aria-label="Close chat">
                    ×
                </button>
            </header>

            <section class="miv-a11y-panel" id="miv-a11y-panel" hidden>
                <div class="miv-a11y-panel-header">
                    <span>Accessibility Settings</span>
                    <button class="miv-a11y-close" id="miv-a11y-close" aria-label="Close accessibility panel">
                        ×
                    </button>
                </div>

                <div class="miv-a11y-row">
                    <span>Font size</span>
                    <div class="miv-a11y-controls">
                        <button type="button" class="miv-a11y-btn" id="miv-font-dec">A-</button>
                        <button type="button" class="miv-a11y-btn" id="miv-font-inc">A+</button>
                    </div>
                </div>

                <div class="miv-a11y-row">
                    <span>Contrast</span>
                    <button type="button" class="miv-a11y-btn" id="miv-contrast-toggle">
                        Toggle Contrast
                    </button>
                </div>
            </section>

            <section class="miv-messages" id="miv-messages"></section>

            <form class="miv-input-row" id="miv-form">
                <input
                    id="miv-user-input"
                    type="text"
                    class="miv-input"
                    placeholder="Ask me anything"
                    aria-label="Message input"
                />
                <button
                    type="submit"
                    class="miv-send-btn"
                    id="miv-send-btn"
                >
                    Send
                </button>
            </form>
        </div>
    </div>
    <?php
}
add_action('wp_footer', 'miv_inject_copilot_widget');
