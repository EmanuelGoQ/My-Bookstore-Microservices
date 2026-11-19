import { loadProto, createGrpcClient, callUnary } from "@bookstore/shared";

// gRPC client to user-service, used to confirm the ordering customer exists.
export const createUserClient = (target) => {
  const proto = loadProto("user.proto");
  const ServiceClient = proto.bookstore.user.v1.UserService;
  const client = createGrpcClient(ServiceClient, target);

  const getCustomer = async (customerId) => {
    const response = await callUnary(client, "GetCustomer", { customer_id: customerId });
    if (!response.found) {
      return null;
    }
    return {
      customerId: response.customer.customer_id,
      firstName: response.customer.first_name,
      lastName: response.customer.last_name,
      email: response.customer.email,
    };
  };

  return { getCustomer };
};
