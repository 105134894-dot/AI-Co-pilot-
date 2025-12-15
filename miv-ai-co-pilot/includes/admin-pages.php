<?php
if (!defined('ABSPATH')) exit;

add_action('admin_menu', 'miv_register_admin_menu');
add_action('admin_init', 'miv_register_api_settings');
add_action('admin_post_miv_upload_docs', 'miv_handle_doc_upload');

function miv_register_admin_menu()
{
    add_menu_page(
        'MIV AI Co-Pilot',
        'MIV',
        'manage_options',
        'miv-dashboard',
        'miv_render_dashboard_page',
        'dashicons-robot',
        30
    );

    add_submenu_page(
        'miv-dashboard',
        'API Settings',
        'API Settings',
        'manage_options',
        'miv-api-settings',
        'miv_render_api_settings_page'
    );

    add_submenu_page(
        'miv-dashboard',
        'Knowledge Base',
        'Knowledge Base',
        'manage_options',
        'miv-knowledge',
        'miv_render_knowledge_page'
    );
}

function miv_render_dashboard_page()
{
?>
    <div class="wrap">
        <h1>MIV Dashboard</h1>
        <p>Use the menu items to configure API keys and upload documents for training.</p>
    </div>
<?php
}

function miv_render_api_settings_page()
{
?>
    <div class="wrap">
        <h1>MIV – API Settings</h1>
        <form method="post" action="options.php">
            <?php
            settings_fields('miv_api_settings');
            do_settings_sections('miv-api-settings');
            submit_button();
            ?>
        </form>
    </div>
<?php
}

function miv_register_api_settings()
{
    register_setting('miv_api_settings', 'miv_gemini_api_key');
    register_setting('miv_api_settings', 'miv_pinecone_api_key');
    register_setting('miv_api_settings', 'miv_pinecone_index');
    register_setting('miv_api_settings', 'miv_backend_url');

    add_settings_section('miv_api_section', 'AI Configuration', null, 'miv-api-settings');

    add_settings_field('miv_backend_url', 'Backend URL', 'miv_text_input', 'miv-api-settings', 'miv_api_section', ['option' => 'miv_backend_url']);
    add_settings_field('miv_gemini_api_key', 'Gemini API Key', 'miv_text_input', 'miv-api-settings', 'miv_api_section', ['option' => 'miv_gemini_api_key']);
    add_settings_field('miv_pinecone_api_key', 'Pinecone API Key', 'miv_text_input', 'miv-api-settings', 'miv_api_section', ['option' => 'miv_pinecone_api_key']);
    add_settings_field('miv_pinecone_index', 'Pinecone Index Name', 'miv_text_input', 'miv-api-settings', 'miv_api_section', ['option' => 'miv_pinecone_index']);
}

function miv_text_input($args)
{
    $value = esc_attr(get_option($args['option'], ''));
    echo "<input type='text' name='{$args['option']}' value='{$value}' class='regular-text'>";
}

function miv_render_knowledge_page()
{
    $action = esc_url(admin_url('admin-post.php'));
?>
    <div class="wrap">
        <h1>MIV – Knowledge Base</h1>

        <?php if (!empty($_GET['success'])): ?>
            <div class="notice notice-success is-dismissible">
                <p><?php echo intval($_GET['success']); ?> file(s) uploaded successfully.</p>
            </div>
        <?php endif; ?>

        <?php if (!empty($_GET['errors'])): ?>
            <div class="notice notice-error is-dismissible">
                <p><?php echo esc_html(urldecode($_GET['errors'])); ?></p>
            </div>
        <?php endif; ?>

        <?php if (!empty($_GET['error']) && $_GET['error'] === 'no_file'): ?>
            <div class="notice notice-warning is-dismissible">
                <p>No files were selected for upload.</p>
            </div>
        <?php endif; ?>

        <form method="post" action="<?php echo $action; ?>" enctype="multipart/form-data">
            <input type="hidden" name="action" value="miv_upload_docs">
            <?php wp_nonce_field('miv_upload_docs'); ?>

            <p><input type="file" name="miv_docs[]" multiple accept=".pdf,.docx,.txt" /></p>
            <?php submit_button('Upload & Train'); ?>
        </form>
    </div>
<?php
}

function miv_handle_doc_upload()
{
    if (!current_user_can('manage_options')) {
        wp_die('Unauthorized');
    }
    check_admin_referer('miv_upload_docs');

    // Get backend URL from settings (or use hardcoded default)
    $backend = get_option('miv_backend_url', 'https://ict30018-project-b-ai-co-pilot.onrender.com');
    $ingest_url = rtrim($backend, '/') . '/ingest';

    // Check if files were uploaded
    if (empty($_FILES['miv_docs']['tmp_name'][0])) {
        wp_redirect(admin_url('admin.php?page=miv-knowledge&error=no_file'));
        exit;
    }

    $upload_count = 0;
    $errors = [];

    // Process each uploaded file
    foreach ($_FILES['miv_docs']['tmp_name'] as $index => $tmp_path) {
        if (!$tmp_path || $_FILES['miv_docs']['error'][$index] !== UPLOAD_ERR_OK) {
            continue;
        }

        $filename = sanitize_file_name($_FILES['miv_docs']['name'][$index]);

        // Validate file type
        $allowed_extensions = ['pdf', 'docx'];
        $file_extension = strtolower(pathinfo($filename, PATHINFO_EXTENSION));

        if (!in_array($file_extension, $allowed_extensions)) {
            $errors[] = "$filename: Invalid file type (only PDF and DOCX allowed)";
            continue;
        }

        // Prepare multipart form data
        $boundary = wp_generate_password(24, false);
        $file_contents = file_get_contents($tmp_path);

        // Build multipart body
        $body = '';
        $body .= "--{$boundary}\r\n";
        $body .= "Content-Disposition: form-data; name=\"file\"; filename=\"{$filename}\"\r\n";
        $body .= "Content-Type: application/octet-stream\r\n\r\n";
        $body .= $file_contents . "\r\n";
        $body .= "--{$boundary}--\r\n";

        // Send request to FastAPI backend
        $response = wp_remote_post($ingest_url, [
            'timeout' => 120, // Increased timeout for large files
            'body' => $body,
            'headers' => [
                'Content-Type' => "multipart/form-data; boundary={$boundary}",
            ],
        ]);

        // Handle response
        if (is_wp_error($response)) {
            $errors[] = "$filename: " . $response->get_error_message();
            continue;
        }

        $response_code = wp_remote_retrieve_response_code($response);
        $response_body = wp_remote_retrieve_body($response);

        if ($response_code === 200) {
            $upload_count++;

            // Parse response for additional info
            $result = json_decode($response_body, true);
            if ($result && isset($result['chunks_added'])) {
                error_log("MIV: Successfully uploaded {$filename} - {$result['chunks_added']} chunks added");
            }
        } else {
            $error_msg = "HTTP {$response_code}";
            $result = json_decode($response_body, true);
            if ($result && isset($result['detail'])) {
                $error_msg .= ": " . $result['detail'];
            }
            $errors[] = "$filename: {$error_msg}";
        }
    }

    // Build redirect URL with status
    $redirect_url = admin_url('admin.php?page=miv-knowledge');

    if ($upload_count > 0) {
        $redirect_url = add_query_arg('success', $upload_count, $redirect_url);
    }

    if (!empty($errors)) {
        $redirect_url = add_query_arg('errors', urlencode(implode(' | ', $errors)), $redirect_url);
    }

    wp_redirect($redirect_url);
    exit;
}
