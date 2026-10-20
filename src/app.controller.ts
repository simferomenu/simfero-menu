import { Controller, Query, Delete, Get, Post, Put, Body, Param } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('tables')
  getTales() {
    return this.appService.getTables();
  }

  @Get('menu')
  getMenu() {
    return this.appService.getMenuLastData();
  }

  /*
    {
      "table": "1c34b882-4261-4364-8339-d8459ad8bf16",
      "items": [{
          "productId": "045815e9-7577-46e5-aacd-4a5793d82791",
          "price": 3250,
          "type": "Product",
          "amount": 1
      }]
    }
  */
  @Post('order')
  createOrder(@Body() data) {
    return this.appService.createOrder(data);
  }

  @Delete('order')
  deleteOrder(@Query() data) {
    return this.appService.deleteTableOrder(data);
  }

  @Post('table-orders')
  getTableOrders(@Body() data) {
    return this.appService.getTableOrders(data);
  }

  /*
    {
      "order": "9b7c2541-1862-4bf2-9f93-450d76d970ff",
      "items": [{
        "productId": "eba4e6bb-243f-4108-bb1a-8790dd5fa3ed",
        "price": 1450,
        "amount": 4,
        "type": "Product"
      }]
    }
  */
  @Put('order')
  updateOrder(@Body() data) {
    return this.appService.updateOrder(data);
  }

  @Put('pre-order')
  preOrderCheck(@Body() data) {
    return this.appService.preOrderUpdate(data);
  }

  @Get('table/check/:tableId')
  checkTableOrders(@Param() params) {
    return this.appService.checkTableOrders(params);
  }

  @Get('info/:tableId')
  getMenuInfo(@Param() params) {
    return this.appService.getTotalInfo(params);
  }

  @Get('sync-data')
  syncData() {
    return this.appService.syncData();
  }

  @Get('webhooks')
  getWebhookSettings() {
    return this.appService.getWebhookSettings();
  }

  @Post('webhooks')
  setWebhookSettings(data) {
	console.log('/webhooks/', data);
      	  //return this.appService.setWebhookSettings();
  }

  @Post('/webhook/call')
  async webhookCall(@Body() data) {
    console.log('/webhook/call', data);
    return this.appService.webhookHandler(data);
  }
}
