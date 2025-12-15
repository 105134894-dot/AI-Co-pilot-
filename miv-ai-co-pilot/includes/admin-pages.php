<?php
if (!defined('ABSPATH')) exit;

add_action('admin_menu', 'miv_register_admin_menu');
add_action('admin_init', 'miv_register_api_settings');
add_action('admin_post_miv_upload_docs', 'miv_handle_doc_upload');

function miv_register_admin_menu() {
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

function miv_render_dashboard_page() {
    ?>
    <div class="wrap">
        <h1>MIV Dashboard</h1>
        <p>Use the menu items to configure API keys and upload documents for training.</p>
    </div>
    <?php
}

function miv_render_api_settings_page() {
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

function miv_register_api_settings() {
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

function miv_text_input($args) {
    $value = esc_attr(get_option($args['option'], ''));
    echo "<input type='text' name='{$args['option']}' value='{$value}' class='regular-text'>";
}

function miv_render_knowledge_page() {
    $action = esc_url(admin_url('admin-post.php'));
    ?>
    <div class="wrap">
        <h1>MIV – Knowledge Base</h1>

        <?php if (!empty($_GET['success'])): ?>
            <div class="notice notice-success"><p>Uploaded successfully.</p></div>
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

function miv_handle_doc_upload() {
    if (!current_user_can('manage_options')) wp_die('Unauthorized');
    check_admin_referer('miv_upload_docs');

    $backend = get_option('miv_backend_url', 'http://localhost:8000');
    $ingest_url = rtrim($backend, '/') . '/ingest';

    if (empty($_FILES['miv_docs']['tmp_name'][0])) {
        wp_redirect(admin_url('admin.php?page=miv-knowledge'));
        exit;
    }

    $payload = [
        'gemini_key'   => get_option('miv_gemini_api_key'),
        'pinecone_key' => get_option('miv_pinecone_api_key'),
        'index_name'   => get_option('miv_pinecone_index')
    ];

    foreach ($_FILES['miv_docs']['tmp_name'] as $i => $tmp) {
        if (!$tmp) continue;

        $filetype = $_FILES['miv_docs']['type'][$i];
        $filename = $_FILES['miv_docs']['name'][$i];

        $response = wp_remote_post($ingest_url, [
            'timeout' => 60,
            'body' => [
                'config' => wp_json_encode($payload),
            ],
            'headers' => [],
        ]);

        // NOTE: this is a placeholder post - we'll switch to multipart upload next step
        // Once your backend endpoint is ready to accept multipart files, we’ll upgrade this.
    }

    wp_redirect(admin_url('admin.php?page=miv-knowledge&success=1'));
    exit;
}
