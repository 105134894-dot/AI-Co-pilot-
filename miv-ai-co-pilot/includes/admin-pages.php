<?php
if (!defined('ABSPATH')) exit;

/**
 * Admin menu
 */
function miv_register_admin_menu() {
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
 * Register stored options (MVP can still be read-only in UI)
 */
function miv_register_settings() {
  register_setting('miv_ai_copilot_settings', 'miv_backend_url');
  register_setting('miv_ai_copilot_settings', 'miv_gemini_api_key');
  register_setting('miv_ai_copilot_settings', 'miv_pinecone_api_key');
  register_setting('miv_ai_copilot_settings', 'miv_pinecone_index');
  register_setting('miv_ai_copilot_settings', 'miv_default_prompt');
}
add_action('admin_init', 'miv_register_settings');

/**
 * Enqueue admin assets ONLY on our plugin page
 */
function miv_enqueue_admin_assets($hook) {
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
function miv_mask_secret($value) {
  $value = (string) $value;
  $len = strlen($value);
  if ($len === 0) return '';
  if ($len <= 8) return str_repeat('•', $len);
  return substr($value, 0, 4) . str_repeat('•', $len - 8) . substr($value, -4);
}

function miv_get_backend_url() {
  $url = get_option('miv_backend_url', '');
  if (!$url) $url = 'http://localhost:8000';
  return rtrim($url, '/');
}

/**
 * Render admin page (Image 1)
 */
function miv_render_admin_page() {
  if (!current_user_can('manage_options')) return;

  $tab = isset($_GET['tab']) ? sanitize_text_field($_GET['tab']) : 'settings';

  // Values
  $backend_url   = miv_get_backend_url();
  $gemini_raw    = get_option('miv_gemini_api_key', '');
  $pinecone_raw  = get_option('miv_pinecone_api_key', '');
  $pinecone_idx  = get_option('miv_pinecone_index', 'miv-knowledge-base');

  $default_prompt = get_option(
    'miv_default_prompt',
    "You are an AI Co-Pilot for accessibility and inclusive design,\n"
    . "specifically supporting Mekong Inclusive Ventures (MIV) practitioners,\n"
    . "educators, and Entrepreneur Support Organizations (ESOs).\n\n"
    . "Your role is to:\n"
    . "- Guide users in discovering and using accessible digital tools\n"
    . "- Provide step-by-step guidance on implementing accessibility features\n"
    . "- Share relevant tool links and inclusive design tips\n"
    . "- Make accessibility concepts easy to understand for non-technical users\n\n"
    . "Always be conversational, practical, and focus on actionable advice based on the context provided.\n\n"
    . "If the context doesn't contain the answer, say you don't know based on the MIV knowledge base,\n"
    . "but provide general best practices if applicable."
  );

  // NOTE: keep this consistent with where your admin logo lives.
  // If your logo is in /img/ then use plugins_url('img/miv-logo.jpg', dirname(__FILE__)) approach.
  // Here we assume /img/miv-logo.jpg relative to the main plugin file.
  $logo_url = plugins_url('img/miv-logo.jpg', dirname(__FILE__));
  ?>
  <div class="miv-admin-wrap">

    <!-- Header -->
    <div class="miv-admin-header">
      <img class="miv-admin-logo" src="<?php echo esc_url($logo_url); ?>" alt="MIV logo" />
      <div>
        <h1 class="miv-admin-title">AI Co-Pilot Settings</h1>
        <p class="miv-admin-subtitle">Manage your MIV chatbot configuration and knowledge base (MVP).</p>
      </div>
    </div>

    <div class="miv-admin-divider"></div>

    <!-- Tabs -->
    <h2 class="nav-tab-wrapper miv-tabs">
      <a
        href="<?php echo esc_url(admin_url('admin.php?page=miv-ai-copilot&tab=settings')); ?>"
        class="nav-tab <?php echo $tab === 'settings' ? 'nav-tab-active' : ''; ?>"
      >
        Co-Pilot Settings
      </a>
      <a
        href="<?php echo esc_url(admin_url('admin.php?page=miv-ai-copilot&tab=kb')); ?>"
        class="nav-tab <?php echo $tab === 'kb' ? 'nav-tab-active' : ''; ?>"
      >
        Knowledge Base
      </a>
    </h2>

    <?php if ($tab === 'settings'): ?>

      <div class="miv-panel miv-api-settings">

        <div class="miv-api-form-group">
          <label class="miv-api-label">Backend URL</label>
          <input class="miv-api-input" type="text" value="<?php echo esc_attr($backend_url); ?>" readonly />
          <p class="description">Managed backend. (MVP: Read-only)</p>
        </div>

        <div class="miv-api-form-group">
          <label class="miv-api-label">Gemini API Key</label>
          <input class="miv-api-input" type="text" value="<?php echo esc_attr(miv_mask_secret($gemini_raw)); ?>" readonly />
          <p class="description">Your Google Gemini API key. (MVP: Read-only)</p>
        </div>

        <div class="miv-api-form-group">
          <label class="miv-api-label">Pinecone API Key</label>
          <input class="miv-api-input" type="text" value="<?php echo esc_attr(miv_mask_secret($pinecone_raw)); ?>" readonly />
          <p class="description">Your Pinecone vector DB key. (MVP: Read-only)</p>
        </div>

        <div class="miv-api-form-group">
          <label class="miv-api-label">Pinecone Index Name</label>
          <input class="miv-api-input" type="text" value="<?php echo esc_attr($pinecone_idx); ?>" readonly />
          <p class="description">The index name in Pinecone. (MVP: Read-only)</p>
        </div>

        <div class="miv-api-form-group">
          <label class="miv-api-label">Default System Prompt</label>
          <div class="miv-prompt-box"><?php echo nl2br(esc_html($default_prompt)); ?></div>
          <p class="description">The base prompt for the AI Co-Pilot. (MVP: Read-only)</p>
        </div>

        <button type="button" class="miv-save-btn" disabled>Save Changes</button>
      </div>

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
                accept=".pdf,.doc,.docx,.txt,.md"
              />
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
 * AJAX endpoints expected by admin.js
 * NOTE: These are stubs unless your backend routes exist.
 * If your backend doesn't have /kb/list and /kb/upload yet, tell me what endpoints you do have.
 */

add_action('wp_ajax_miv_kb_list', 'miv_kb_list');
function miv_kb_list() {
  if (!current_user_can('manage_options')) {
    wp_send_json_error(array('message' => 'Forbidden'));
  }
  check_ajax_referer('miv_admin_nonce', 'nonce');

  // MVP response (empty list) unless you have a backend endpoint to call.
  wp_send_json_success(array('files' => array()));
}

add_action('wp_ajax_miv_kb_upload', 'miv_kb_upload');
function miv_kb_upload() {
  if (!current_user_can('manage_options')) {
    wp_send_json_error(array('message' => 'Forbidden'));
  }
  check_ajax_referer('miv_admin_nonce', 'nonce');

  // MVP: accept upload and respond success (no backend)
  if (empty($_FILES['miv_kb_file']) || empty($_FILES['miv_kb_file']['tmp_name'])) {
    wp_send_json_error(array('message' => 'No file received'));
  }

  wp_send_json_success(array('message' => 'Upload received (MVP stub).'));
}
