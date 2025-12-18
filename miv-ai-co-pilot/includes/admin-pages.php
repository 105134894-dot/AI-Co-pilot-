<?php
if (!defined('ABSPATH')) exit;

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

function miv_admin_assets($hook) {
  // Only load on our page
  if ($hook !== 'toplevel_page_miv-ai-copilot') return;

  wp_enqueue_style(
    'miv-admin-style',
    plugin_dir_url(__FILE__) . '../assets/admin/admin.css',
    array(),
    filemtime(plugin_dir_path(__FILE__) . '../assets/admin/admin.css')
  );

  wp_enqueue_script(
    'miv-admin-script',
    plugin_dir_url(__FILE__) . '../assets/admin/admin.js',
    array(),
    filemtime(plugin_dir_path(__FILE__) . '../assets/admin/admin.js'),
    true
  );

  wp_localize_script('miv-admin-script', 'MIV_ADMIN', array(
    'ajaxUrl' => admin_url('admin-ajax.php'),
    'nonce'   => wp_create_nonce('miv-admin-nonce'),
  ));
}
add_action('admin_enqueue_scripts', 'miv_admin_assets');
add_action('wp_ajax_miv_kb_upload', 'miv_handle_kb_upload_ajax');
add_action('wp_ajax_miv_kb_list', 'miv_handle_kb_list_ajax');

/**
 * Admin page UI
 */
function miv_render_admin_page() {
  if (!current_user_can('manage_options')) return;

  $tab = isset($_GET['tab']) ? sanitize_text_field($_GET['tab']) : 'settings';

  // Read-only values (MVP)
  $gemini_key_preview = miv_mask_secret(get_option('miv_gemini_api_key', ''));
  $default_prompt = get_option('miv_default_prompt', "You are an AI Co-Pilot for accessibility and inclusive design...");

  ?>
  <div class="wrap miv-admin-wrap">
    <div class="miv-admin-header">
      <img class="miv-admin-logo" src="<?php echo esc_url(plugins_url('../img/miv-logo.jpg', __FILE__)); ?>" alt="MIV Logo" />
      <div>
        <div class="miv-admin-title">AI Co-Pilot Settings</div>
        <div class="miv-admin-subtitle">Manage your MIV chatbot configuration and knowledge base (MVP).</div>
      </div>
    </div>

    <div class="miv-admin-divider"></div>

    <h2 class="nav-tab-wrapper miv-tabs">
      <a href="?page=miv-ai-copilot&tab=settings" class="nav-tab <?php echo $tab === 'settings' ? 'nav-tab-active' : ''; ?>">Co-Pilot Settings</a>
      <a href="?page=miv-ai-copilot&tab=kb" class="nav-tab <?php echo $tab === 'kb' ? 'nav-tab-active' : ''; ?>">Knowledge Base</a>
    </h2>

    <?php if ($tab === 'settings'): ?>

      <div class="miv-panel">
        <form method="post" class="miv-settings-form">
          <div class="miv-form-grid">
            <label class="miv-label" for="miv-backend-url">Backend URL</label>
            <div>
              <input type="url" id="miv-backend-url" class="miv-input" placeholder="https://api.miv-copilot.com" required />
              <p class="miv-readonly-hint">The API endpoint for your hosted backend. (MVP: Read-only)</p>
            </div>

            <label class="miv-label" for="miv-gemini-key">Gemini API Key</label>
            <div>
              <input type="text" id="miv-gemini-key" class="miv-input" value="<?php echo esc_attr($gemini_key_preview); ?>" readonly />
              <p class="miv-readonly-hint">Your Google Gemini API key. (MVP: Read-only)</p>
            </div>

            <label class="miv-label" for="miv-pinecone-key">Pinecone API Key</label>
            <div>
              <input type="text" id="miv-pinecone-key" class="miv-input" value="••••••••••••••••••••••••••••••••" readonly />
              <p class="miv-readonly-hint">Your Pinecone vector DB key. (MVP: Read-only)</p>
            </div>

            <label class="miv-label" for="miv-pinecone-index">Pinecone Index Name</label>
            <div>
              <input type="text" id="miv-pinecone-index" class="miv-input" value="miv-knowledge-base" readonly />
              <p class="miv-readonly-hint">The index name in Pinecone. (MVP: Read-only)</p>
            </div>

            <label class="miv-label" for="miv-default-prompt">Default System Prompt</label>
            <div>
              <textarea id="miv-default-prompt" class="miv-textarea" readonly><?php echo esc_textarea($default_prompt); ?></textarea>
              <p class="miv-readonly-hint">The base prompt for the AI Co-Pilot. (MVP: Read-only)</p>
            </div>
          </div>

          <div style="margin-top: 22px;">
            <button type="submit" class="miv-btn">Save Changes</button>
          </div>
        </form>
      </div>

    <?php else: // Knowledge Base tab ?>

  <div class="miv-panel">
    <div class="miv-kb-upload-section">
      <div class="miv-kb-upload-title">Upload New Knowledge Base File:</div>
      <div class="miv-kb-upload-row">
        <input type="file" id="miv_kb_file" class="miv-kb-file-input" accept=".pdf,.docx" />
        <button type="submit" id="miv-kb-upload-btn" class="miv-kb-upload-btn">Upload & Train</button>
      </div>
      <div class="miv-progress-wrap" id="miv-progress-wrap" style="display:none; margin: 20px auto; width: 60%; height: 8px; background: #e9ecef; border-radius: 4px; overflow: hidden;">
        <div class="miv-progress-bar" id="miv-progress-bar" style="height: 100%; width: 0%; background: #6f42c1; transition: width 0.3s;"></div>
      </div>
      <div class="miv-status" id="miv-status" style="margin-top: 12px; font-size: 15px; color: #495057;"></div>
    </div>

    <table class="miv-kb-table">
      <thead>
        <tr>
          <th>Filename</th>
          <th>Uploaded</th>
        </tr>
      </thead>
      <tbody id="miv-kb-files-tbody">
        <!-- Filled by JS -->
      </tbody>
    </table>
  </div>

<?php endif; ?>

  </div>
  <?php
}

function miv_mask_secret($val) {
  $val = (string)$val;
  if ($val === '') return '';
  $last = substr($val, -4);
  return str_repeat('•', max(0, strlen($val) - 4)) . $last;
}

function miv_handle_kb_upload_ajax() {
    if (!current_user_can('manage_options')) {
        wp_send_json_error(['message' => 'Unauthorized']);
    }
    check_ajax_referer('miv-admin-nonce', 'nonce');

    if (empty($_FILES['miv_kb_file'])) {
        wp_send_json_error(['message' => 'No file uploaded']);
    }

    $file = $_FILES['miv_kb_file'];
    $filename = sanitize_file_name($file['name']);

    $allowed_extensions = ['pdf', 'docx'];
    $file_extension = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
    if (!in_array($file_extension, $allowed_extensions)) {
        wp_send_json_error(['message' => "Invalid file type for $filename (only PDF and DOCX allowed)"]);
    }

    $backend = get_option('miv_backend_url', 'http://localhost:8000');
    $ingest_url = rtrim($backend, '/') . '/ingest';

    $boundary = wp_generate_password(24, false);
    $file_contents = file_get_contents($file['tmp_name']);

    $body = "--{$boundary}\r\n";
    $body .= "Content-Disposition: form-data; name=\"file\"; filename=\"{$filename}\"\r\n";
    $body .= "Content-Type: application/octet-stream\r\n\r\n";
    $body .= $file_contents . "\r\n";
    $body .= "--{$boundary}--\r\n";

    $response = wp_remote_post($ingest_url, [
        'timeout' => 120,
        'body' => $body,
        'headers' => ['Content-Type' => "multipart/form-data; boundary={$boundary}"],
    ]);

    if (is_wp_error($response)) {
        wp_send_json_error(['message' => $response->get_error_message()]);
    }

    $response_code = wp_remote_retrieve_response_code($response);
    $response_body = json_decode(wp_remote_retrieve_body($response), true);

    if ($response_code === 200 && isset($response_body['success']) && $response_body['success']) {
        wp_send_json_success($response_body);
    } else {
        $error_msg = $response_body['detail'] ?? 'Unknown error';
        wp_send_json_error(['message' => $error_msg]);
    }
}

function miv_handle_kb_list_ajax() {
    if (!current_user_can('manage_options')) {
        wp_send_json_error(['message' => 'Unauthorized']);
    }
    check_ajax_referer('miv-admin-nonce', 'nonce');

    $backend = get_option('miv_backend_url', 'http://localhost:8000');
    $list_url = rtrim($backend, '/') . '/files';

    $response = wp_remote_get($list_url, ['timeout' => 30]);

    if (is_wp_error($response)) {
        wp_send_json_error(['message' => $response->get_error_message()]);
    }

    $response_code = wp_remote_retrieve_response_code($response);
    $response_body = json_decode(wp_remote_retrieve_body($response), true);

    if ($response_code === 200 && isset($response_body['files'])) {
        wp_send_json_success(['files' => $response_body['files']]);
    } else {
        wp_send_json_error(['message' => 'Failed to fetch file list from backend']);
    }
}