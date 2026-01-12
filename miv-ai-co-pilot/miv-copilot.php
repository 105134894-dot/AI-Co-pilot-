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

// Load admin-pages.php FIRST (it contains miv_get_backend_url)
require_once plugin_dir_path(__FILE__) . 'includes/admin-pages.php';

/**
 * Enqueue CSS and JS for the widget
 */
function miv_enqueue_copilot_assets()
{
    $plugin_url = plugin_dir_url(__FILE__);
    $plugin_dir = plugin_dir_path(__FILE__);

    // --- MERGE CRITICAL: Keep marked.js from Main Branch ---
    // This is required for the Markdown parsing in the JS
    wp_enqueue_script(
        'marked-js',
        'https://cdn.jsdelivr.net/npm/marked@4.0.0/marked.min.js',
        array(),
        '4.0.0',
        true
    );

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

    // Get system prompt from WordPress database
    $default_prompt = "You are an AI Co-Pilot for accessibility and inclusive design,\n"
        . "specifically supporting Mekong Inclusive Ventures (MIV) practitioners,\n"
        . "educators, and Entrepreneur Support Organizations (ESOs).\n\n"
        . "Your role is to:\n"
        . "- Guide users in discovering and using accessible digital tools\n"
        . "- Provide step-by-step guidance on implementing accessibility features\n"
        . "- Share relevant tool links and inclusive design tips\n"
        . "- Make accessibility concepts easy to understand for non-technical users\n\n"
        . "Always be conversational, practical, and focus on actionable advice based on the context provided.\n\n"
        . "If the context doesn't contain the answer, say you don't know based on the MIV knowledge base,\n"
        . "but provide general best practices if applicable.";

    $system_prompt = get_option('miv_default_prompt', $default_prompt);

    // Use centralized function from admin-pages.php
    wp_localize_script(
        'miv-copilot-script',
        'MIV_WIDGET_CONFIG',
        array(
            'backendUrl'      => miv_get_backend_url(), // Single source of truth
            'storageVersion'  => (string) filemtime($plugin_dir . 'assets/js/miv-widget.js'),
            'systemPrompt'    => $system_prompt
        )
    );
}
add_action('wp_enqueue_scripts', 'miv_enqueue_copilot_assets');

/**
 * Output the widget HTML in the footer
 * This contains the new Back/Forward/Clear buttons required by the new JS.
 */
function miv_inject_copilot_widget()
{
    $button_img = plugins_url('img/miv-button.png', __FILE__);
    $logo_img   = plugins_url('img/miv-logo.png', __FILE__); // Using .png from Peter's branch
?>
    <div class="miv-widget-root" id="miv-widget-root">
        <button
            class="miv-launcher-btn"
            id="miv-launcher-btn"
            aria-label="Open MIV AI Co-Pilot">
            <img
                src="<?php echo esc_url($button_img); ?>"
                alt="Open AI Co-Pilot"
                class="miv-launcher-img" />
        </button>

        <div
            class="miv-chat-window"
            id="miv-chat-window"
            role="dialog"
            aria-modal="true"
            aria-hidden="true">
            <div class="miv-resize-handle" id="miv-resize-handle" aria-hidden="true"></div>
            <header class="miv-chat-header">

                <div class="miv-header-left">
                    <img
                        src="<?php echo esc_url($logo_img); ?>"
                        alt="MIV logo"
                        class="miv-logo" />
                    <div class="miv-header-title">AI Co-Pilot</div>
                </div>

                <div class="miv-header-actions">

                    <button
                        class="miv-header-icon-btn"
                        id="miv-back-btn"
                        aria-label="Go back"
                        title="Back"
                        hidden>
                        ←
                    </button>

                    <button
                        class="miv-header-icon-btn"
                        id="miv-forward-btn"
                        aria-label="Go forward"
                        title="Forward"
                        hidden>
                        →
                    </button>

                    <button
                        class="miv-header-icon-btn"
                        id="miv-clear-chat-btn"
                        aria-label="Clear chat"
                        title="Reset Settings">
                        ↺
                    </button>

                    <button
                        class="miv-a11y-toggle"
                        id="miv-a11y-toggle"
                        aria-label="Accessibility options"
                        title="Change Accessibility Settings">
                        ♿
                    </button>

                    <button
                        class="miv-close-btn"
                        id="miv-close-btn"
                        aria-label="Close chat"
                        title="Close AI Chat">
                        ×
                    </button>
                </div>
            </header>

            <section class="miv-a11y-panel" id="miv-a11y-panel" hidden>
                <div class="miv-a11y-panel-header">
                    <span>Accessibility Settings</span>
                    <button
                        id="miv-a11y-reset"
                        aria-label="Reset accessibility settings"
                        title="Reset Accessibility Settings">
                        ↺
                    </button>

                    <button
                        class="miv-a11y-close"
                        id="miv-a11y-close"
                        aria-label="Close accessibility panel"
                        title="Close Accessibility Settings">
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
                    <button
                        type="button"
                        class="miv-a11y-btn"
                        id="miv-contrast-toggle">
                        Toggle Contrast
                    </button>
                </div>
            </section>

            <section
                class="miv-messages"
                id="miv-messages"
                aria-live="polite"
                role="log"
                aria-label="Chat messages">
            </section>

            <form class="miv-input-row" id="miv-form">
                <input
                    id="miv-user-input"
                    type="text"
                    class="miv-input"
                    placeholder="Ask me anything"
                    aria-label="Message input" />
                <button
                    type="submit"
                    class="miv-send-btn"
                    id="miv-send-btn">
                    Send
                </button>
            </form>
        </div>
    </div>
<?php
}
add_action('wp_footer', 'miv_inject_copilot_widget');
