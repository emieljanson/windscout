#include "dns_server.h"

#include <string.h>

#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "lwip/sockets.h"

static const char *TAG = "dns_server";
static int dns_socket = -1;
static TaskHandle_t dns_task_handle = NULL;
static bool dns_running = false;

#define DNS_PORT 53
#define DNS_MAX_LEN 512

// DNS header structure
typedef struct __attribute__((packed)) {
    uint16_t id;
    uint16_t flags;
    uint16_t questions;
    uint16_t answers;
    uint16_t authority;
    uint16_t additional;
} dns_header_t;

// DNS answer structure
typedef struct __attribute__((packed)) {
    uint16_t name_ptr;
    uint16_t type;
    uint16_t class;
    uint32_t ttl;
    uint16_t data_len;
    uint32_t ip_addr;
} dns_answer_t;

static void dns_server_task(void *pvParameters)
{
    struct sockaddr_in server_addr;
    struct sockaddr_in client_addr;
    socklen_t client_addr_len = sizeof(client_addr);
    uint8_t rx_buffer[DNS_MAX_LEN];
    uint8_t tx_buffer[DNS_MAX_LEN];

    // Create UDP socket
    dns_socket = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
    if (dns_socket < 0) {
        ESP_LOGE(TAG, "Failed to create socket");
        vTaskDelete(NULL);
        return;
    }

    // Bind to DNS port
    memset(&server_addr, 0, sizeof(server_addr));
    server_addr.sin_family = AF_INET;
    server_addr.sin_addr.s_addr = htonl(INADDR_ANY);
    server_addr.sin_port = htons(DNS_PORT);

    if (bind(dns_socket, (struct sockaddr *) &server_addr, sizeof(server_addr)) < 0) {
        ESP_LOGE(TAG, "Failed to bind socket");
        close(dns_socket);
        dns_socket = -1;
        vTaskDelete(NULL);
        return;
    }

    ESP_LOGI(TAG, "DNS server started on port %d", DNS_PORT);
    dns_running = true;

    while (dns_running) {
        int len = recvfrom(dns_socket, rx_buffer, sizeof(rx_buffer), 0,
                           (struct sockaddr *) &client_addr, &client_addr_len);

        if (len < sizeof(dns_header_t)) {
            continue;
        }

        dns_header_t *header = (dns_header_t *) rx_buffer;

        // Only respond to queries
        if ((ntohs(header->flags) & 0x8000) == 0) {
            // Build response
            memcpy(tx_buffer, rx_buffer, len);
            dns_header_t *response_header = (dns_header_t *) tx_buffer;

            // Set response flags
            response_header->flags = htons(0x8180);  // Standard query response, no error
            response_header->answers = htons(1);
            response_header->authority = 0;
            response_header->additional = 0;

            // Add answer pointing to 192.168.4.1
            dns_answer_t *answer = (dns_answer_t *) (tx_buffer + len);
            answer->name_ptr = htons(0xC00C);     // Pointer to domain name in question
            answer->type = htons(1);              // A record
            answer->class = htons(1);             // IN
            answer->ttl = htonl(60);              // 60 seconds TTL
            answer->data_len = htons(4);          // IPv4 address length
            answer->ip_addr = htonl(0xC0A80401);  // 192.168.4.1

            int response_len = len + sizeof(dns_answer_t);

            sendto(dns_socket, tx_buffer, response_len, 0, (struct sockaddr *) &client_addr,
                   client_addr_len);
        }
    }

    close(dns_socket);
    dns_socket = -1;
    vTaskDelete(NULL);
}

esp_err_t dns_server_start(void)
{
    if (dns_task_handle != NULL) {
        ESP_LOGW(TAG, "DNS server already running");
        return ESP_OK;
    }

    BaseType_t ret = xTaskCreate(dns_server_task, "dns_server", 4096, NULL, 5, &dns_task_handle);
    if (ret != pdPASS) {
        ESP_LOGE(TAG, "Failed to create DNS server task");
        return ESP_FAIL;
    }

    return ESP_OK;
}

void dns_server_stop(void)
{
    if (dns_task_handle != NULL) {
        dns_running = false;
        if (dns_socket >= 0) {
            close(dns_socket);
            dns_socket = -1;
        }
        vTaskDelay(pdMS_TO_TICKS(100));
        dns_task_handle = NULL;
        ESP_LOGI(TAG, "DNS server stopped");
    }
}
