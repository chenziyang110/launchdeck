package com.example.orders;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class OrderApplicationTests {
    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private OrderService orderService;

    @Test
    void healthReportsReadyDatabaseAndDeterministicSeedCount() throws Exception {
        mockMvc.perform(get("/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ok"))
                .andExpect(jsonPath("$.service").value("spring-boot-orders"))
                .andExpect(jsonPath("$.seededOrders").value(3));
    }

    @Test
    void seedIsIdempotentAndOrdersAreSortedByStableCreationTime() throws Exception {
        orderService.seed();

        mockMvc.perform(get("/api/orders"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(3)))
                .andExpect(jsonPath("$[0].id").value("ord-1001"))
                .andExpect(jsonPath("$[1].id").value("ord-1002"))
                .andExpect(jsonPath("$[2].id").value("ord-1003"));
    }

    @Test
    void createsAndReadsAnOrderThroughTheHttpApi() throws Exception {
        mockMvc.perform(post("/api/orders")
                        .contentType("application/json")
                        .content("{\"customer\":\"Northwind Bakery\",\"status\":\"pending\",\"totalCents\":2599}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.customer").value("Northwind Bakery"))
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.totalCents").value(2599));
    }
}
