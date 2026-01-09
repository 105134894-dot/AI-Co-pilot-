<?php
if (!defined('ABSPATH')) exit;

/**
 * Admin menu
 */
function miv_register_admin_menu()
{
    add_menu_page(
        'MIV AI Co-Pilot',
        'MIV AI Co-Pilot',
        'manage_options',
        'miv-ai-copilot',
        'miv_render_admin_page',
        'dashicons-format-chat',
        58
    );
}
add_action('admin_menu', 'miv_register_admin_menu');

/**
 * Register stored options
 */
function miv_register_settings()
{
    // Keep only what the plugin actually uses in the WP admin UI
    register_setting('miv_ai_copilot_settings', 'miv_backend_url');
    register_setting('miv_ai_copilot_settings', 'miv_default_prompt'); // Editable System Prompt
}
add_action('admin_init', 'miv_register_settings');

/**
 * Enqueue admin assets ONLY on our plugin page
 */
function miv_enqueue_admin_assets($hook)
{
    if ($hook !== 'toplevel_page_miv-ai-copilot') return;

    $plugin_url = plugin_dir_url(__FILE__);
    $plugin_dir = plugin_dir_path(__FILE__);

    // Admin CSS (cache-busted)
    wp_enqueue_style(
        'miv-admin-css',
        $plugin_url . '../assets/admin/admin.css',
        array(),
        filemtime($plugin_dir . '../assets/admin/admin.css')
    );

    // Admin JS (cache-busted)
    wp_enqueue_script(
        'miv-admin-js',
        $plugin_url . '../assets/admin/admin.js',
        array(),
        filemtime($plugin_dir . '../assets/admin/admin.js'),
        true
    );

    wp_localize_script('miv-admin-js', 'MIV_ADMIN', array(
        'ajaxUrl' => admin_url('admin-ajax.php'),
        'nonce'   => wp_create_nonce('miv_admin_nonce'),
    ));
}
add_action('admin_enqueue_scripts', 'miv_enqueue_admin_assets');

/**
 * Helpers
 */
function miv_mask_secret($value)
{
    $value = (string) $value;
    $len = strlen($value);
    if ($len === 0) return '';
    if ($len <= 8) return str_repeat('•', $len);
    return substr($value, 0, 4) . str_repeat('•', $len - 8) . substr($value, -4);
}

/**
 * SINGLE SOURCE OF TRUTH: Backend URL Configuration
 * 
 * This function is used by:
 * - Frontend chatbot widget (via wp_localize_script in miv-copilot.php)
 * - Admin panel display (in miv_render_admin_page below)
 * - AJAX endpoints (miv_kb_list and miv_kb_upload)
 * 
 * To switch environments, change ONLY the fallback URL below.
 */
function miv_get_backend_url()
{
    $url = get_option('miv_backend_url', '');

    // SINGLE SOURCE OF TRUTH: Change this one line to switch environments
    if (!$url) $url = 'https://miv-copilot-backend-49945271860.us-east1.run.app'; // Production (default)
    // if (!$url) $url = 'http://localhost:8000'; // Uncomment for local development

    return rtrim($url, '/');
}

/**
 * Render admin page
 */
function miv_render_admin_page()
{
    if (!current_user_can('manage_options')) return;

    $tab = isset($_GET['tab']) ? sanitize_text_field($_GET['tab']) : 'settings';

    // Handle form submission for settings
    if ($tab === 'settings' && isset($_POST['miv_save_settings'])) {
        check_admin_referer('miv_settings_save', 'miv_settings_nonce');

        // Save the system prompt
        $new_prompt = isset($_POST['miv_default_prompt']) ? wp_unslash($_POST['miv_default_prompt']) : '';
        update_option('miv_default_prompt', $new_prompt);

        // Save the backend URL
        $new_url = isset($_POST['miv_backend_url']) ? sanitize_url($_POST['miv_backend_url']) : '';
        update_option('miv_backend_url', $new_url);

        echo '<div class="notice notice-success is-dismissible"><p>Settings saved successfully!</p></div>';
    }

    //  Use centralized function
    $backend_url = miv_get_backend_url();

    $default_prompt = get_option(
        'miv_default_prompt',
        "You are an AI Co-Pilot for accessibility and inclusive design, \n"
            . "specifically supporting Mekong Inclusive Ventures (MIV) practitioners, educators, and \n"
            . "Entrepreneur Support Organizations (ESOs).\n\n"
            . "Provide clear, concise, and actionable advice based on the provided context.\n\n"
            . "Structure responses as:\n"
            . "- Direct answer first\n"
            . "- Step-by-step guidance when needed\n"
            . "- Relevant tool links or examples\n"
            . "- Bullet points for clarity\n\n"
            . "Do not use overly friendly or casual language like \"I'd be happy to help\", \"Sure thing!\", or excessive exclamation marks.\n\n"
            . "If the context does not contain the answer, say: \"I don't have specific information on this in the MIV knowledge base, but here is general best practice:\" followed by helpful guidance.\n\n"
            . "Focus on accuracy, brevity, and professionalism.\n\n"
            . "If the context doesn't contain the answer, say you don't know based on the MIV knowledge base, \n"
            . "but provide general best practices if applicable."
    );

    $logo_url = plugins_url('img/miv-logo.jpg', dirname(__FILE__));
?>
    <div class="miv-admin-wrap">

        <div class="miv-admin-header">
            <img class="miv-admin-logo" src="<?php echo esc_url($logo_url); ?>" alt="MIV logo" />
            <div>
                <h1 class="miv-admin-title">AI Co-Pilot Settings</h1>
                <p class="miv-admin-subtitle">Manage your MIV chatbot configuration and knowledge base.</p>
            </div>
        </div>

        <div class="miv-admin-divider"></div>

        <h2 class="nav-tab-wrapper miv-tabs">
            <a
                href="<?php echo esc_url(admin_url('admin.php?page=miv-ai-copilot&tab=settings')); ?>"
                class="nav-tab <?php echo $tab === 'settings' ? 'nav-tab-active' : ''; ?>">
                Co-Pilot Settings
            </a>
            <a
                href="<?php echo esc_url(admin_url('admin.php?page=miv-ai-copilot&tab=kb')); ?>"
                class="nav-tab <?php echo $tab === 'kb' ? 'nav-tab-active' : ''; ?>">
                Knowledge Base
            </a>
        </h2>

        <?php if ($tab === 'settings'): ?>

            <!-- Now a real form that can be submitted -->
            <form method="post" action="">
                <?php wp_nonce_field('miv_settings_save', 'miv_settings_nonce'); ?>

                <div class="miv-panel miv-api-settings">

                    <div class="miv-api-form-group">
                        <label class="miv-api-label">Backend URL</label>
                        <input class="miv-api-input" type="url" name="miv_backend_url" value="<?php echo esc_attr($backend_url); ?>"placeholder="https://..." />
                        <p class="description">
                            Enter your backend server URL (e.g., Cloud Run or <code>http://localhost:8000</code>).
                            <br>Leave empty to use the default Cloud server.
                        </p>
                    </div>

                    <div class="miv-api-form-group">
                        <label class="miv-api-label" for="miv_default_prompt">System Prompt</label>
                        <!-- Editable textarea -->
                        <textarea
                            id="miv_default_prompt"
                            name="miv_default_prompt"
                            class="miv-prompt-textarea"
                            rows="12"
                            style="width: 100%; font-family: monospace; padding: 10px; border: 1px solid #ddd; border-radius: 4px;"><?php echo esc_textarea($default_prompt); ?></textarea>
                        <p class="description">
                            This prompt defines the AI's behavior and personality. Edit this to change how the chatbot responds to users.
                            <br><strong>Note:</strong> Changes take effect immediately for new conversations.
                        </p>
                    </div>

                    <button type="submit" name="miv_save_settings" class="miv-save-btn">Save Changes</button>
                </div>
            </form>

        <?php else: ?>

            <div class="miv-panel">

                <div class="miv-kb-upload-section">
                    <div class="miv-kb-upload-title">Upload a file to your Knowledge Base</div>

                    <form id="miv-kb-upload-form">
                        <div class="miv-kb-upload-row">
                            <input
                                id="miv_kb_file"
                                class="miv-kb-file-input"
                                type="file"
                                name="miv_kb_file"
                                accept=".pdf,.doc,.docx,.txt,.md" />
                            <button id="miv-kb-upload-btn" class="miv-kb-upload-btn" type="submit">
                                Upload
                            </button>
                        </div>

                        <div id="miv-progress-wrap" style="display:none; margin-top:16px;">
                            <div style="background:#e9ecef; border-radius:999px; overflow:hidden;">
                                <div id="miv-progress-bar" style="height:10px; width:0%; background:#6f42c1;"></div>
                            </div>
                        </div>

                        <div id="miv-status" style="margin-top:10px; color:#495057;"></div>
                    </form>
                </div>

                <table class="miv-kb-table">
                    <thead>
                        <tr>
                            <th>File</th>
                            <th>Uploaded</th>
                        </tr>
                    </thead>
                    <tbody id="miv-kb-files-tbody"></tbody>
                </table>

            </div>

        <?php endif; ?>

    </div>
<?php
}

/**
 * AJAX endpoints
 */

add_action('wp_ajax_miv_kb_list', 'miv_kb_list');
function miv_kb_list()
{
    if (!current_user_can('manage_options')) {
        wp_send_json_error(array('message' => 'Forbidden'));
    }
    check_ajax_referer('miv_admin_nonce', 'nonce');

    // Use centralized function
    $backend_url = miv_get_backend_url();

    // Call the backend to get the list
    $response = wp_remote_get($backend_url . '/list-documents', array(
        'timeout' => 60 // do not change.
    ));

    if (is_wp_error($response)) {
        wp_send_json_error(array(
            'message' => 'Could not connect to backend: ' . $response->get_error_message()
        ));
        return;
    }

    $body = wp_remote_retrieve_body($response);
    $data = json_decode($body, true);

    if (!isset($data['success']) || !$data['success']) {
        wp_send_json_error(array('message' => 'Backend returned an error'));
        return;
    }

    // Format for frontend
    $files = array();
    foreach ($data['documents'] as $doc) {
        $files[] = array(
            'filename' => $doc['filename'],
            'uploaded' => 'Recently' // You could add timestamps to metadata for real dates
        );
    }

    wp_send_json_success(array('files' => $files));
}

add_action('wp_ajax_miv_kb_upload', 'miv_kb_upload');
function miv_kb_upload()
{
    if (!current_user_can('manage_options')) {
        wp_send_json_error(array('message' => 'Forbidden'));
    }

    check_ajax_referer('miv_admin_nonce', 'nonce');

    if (empty($_FILES['miv_kb_file']) || empty($_FILES['miv_kb_file']['tmp_name'])) {
        wp_send_json_error(array('message' => 'No file received'));
    }

    // Use centralized function
    $backend_url = miv_get_backend_url();
    $file = $_FILES['miv_kb_file'];

    // Prepare CURL request to Python Backend
    $ch = curl_init();

    $cfile = new CURLFile($file['tmp_name'], $file['type'], $file['name']);
    $data = array('file' => $cfile);

    curl_setopt($ch, CURLOPT_URL, $backend_url . '/ingest');
    curl_setopt($ch, CURLOPT_POST, 1);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $data);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 300); // do not change. will stop documents from ingesting if too low.

    $response = curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error_msg = curl_error($ch);
    curl_close($ch);

    if ($http_code !== 200) {
        wp_send_json_error(array(
            'message' => 'Backend Error (' . $http_code . '): ' . ($error_msg ?: $response)
        ));
    }

    $json_response = json_decode($response, true);

    if (isset($json_response['success']) && $json_response['success']) {
        wp_send_json_success($json_response);
    } else {
        wp_send_json_error(array('message' => 'Ingestion failed: ' . $response));
    }
}
