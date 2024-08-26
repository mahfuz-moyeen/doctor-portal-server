const express = require("express");
const cors = require("cors");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 8000;

app.use(
  cors({
    origin: ["https://doctor-portal-29178.web.app", "http://localhost:3000"],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// app.use(cors());
app.options("*", cors()); // Enable preflight for all routes
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.f4jstaa.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send({ message: "Forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
};

async function run() {
  try {
    await client.connect();
    const appointmentsCollection = client
      .db("doctor_portal")
      .collection("appointments");
    const bookingCollection = client.db("doctor_portal").collection("booking");
    const userCollection = client.db("doctor_portal").collection("user");
    const doctorCollection = client.db("doctor_portal").collection("doctor");
    const paymentCollection = client.db("doctor_portal").collection("payments");

    const verifyAdmin = async (req, res, next) => {
      const requester = req.decoded.email;
      const requesterAccount = await userCollection.findOne({
        email: requester,
      });
      if (requesterAccount.role === "admin") {
        next();
      } else {
        res.status(403).send({ message: "forbidden" });
      }
    };

    //add & update user
    app.put("/user/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      const token = jwt.sign(
        { email: email },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "1d" }
      );
      res.send({ result, token });
    });

    // get all user
    app.get("/users", verifyToken, async (req, res) => {
      const query = {};
      const users = await userCollection.find(query).toArray();
      res.send(users);
    });

    //make admin
    app.put(
      "/user/admin/:email",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const email = req.params.email;
        const filter = { email: email };
        const updateDoc = {
          $set: { role: "admin" },
        };
        const result = await userCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );

    //get admin

    app.get("/admin/:email", async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email: email });
      const isAdmin = user.role === "admin";
      res.send({ admin: isAdmin });
    });

    //get appointments
    app.get("/appointments", async (req, res) => {
      const query = {};
      const cursor = appointmentsCollection.find(query).project({ name: 1 });
      const appointments = await cursor.toArray();
      res.send(appointments);
    });

    //get available appointment
    app.get("/available", async (req, res) => {
      const date = req.query.date;
      // get all appointments data
      const appointments = await appointmentsCollection.find().toArray();
      //get all booking data
      const query = { date: date };
      const booking = await bookingCollection.find(query).toArray();

      appointments.forEach((appointment) => {
        //find booking for that appointments
        const appointmentBooking = booking.filter(
          (book) => book.bookingName === appointment.name
        );
        // select time for the appointment
        const bookingTime = appointmentBooking.map((book) => book.time);
        // select those slots are not in booking time
        const available = appointment.slots.filter(
          (slot) => !bookingTime.includes(slot)
        );
        appointment.slots = available;
      });
      res.send(appointments);
    });

    //add booking service
    app.post("/booking", async (req, res) => {
      const booking = req.body;
      const query = {
        bookingName: booking.bookingName,
        patientName: booking.patientName,
        date: booking.date,
      };
      const exists = await bookingCollection.findOne(query);
      if (exists) {
        return res.send({ success: false, booking: exists });
      }

      const result = await bookingCollection.insertOne(booking);
      res.send({ success: true, result });
    });

    //get booking
    app.get("/bookings", verifyToken, async (req, res) => {
      const email = req.query.email;
      const decodedEmail = req.decoded.email;
      if (email === decodedEmail) {
        const query = { email: email };
        const cursor = bookingCollection.find(query);
        const booking = await cursor.toArray();
        return res.send(booking);
      } else {
        return res.status(403).send({ message: "Forbidden access" });
      }
    });

    // update booking
    app.patch("/booking/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const payment = req.body;
      const filter = { _id: ObjectId(id) };
      const updatedDoc = {
        $set: {
          paid: true,
          transactionId: payment.transactionId,
        },
      };
      const result = await paymentCollection.insertOne(payment);
      const updatedBooking = await bookingCollection.updateOne(
        filter,
        updatedDoc
      );
      res.send(updatedBooking);
    });

    //get booking
    app.get("/payment/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const payment = await bookingCollection.findOne(query);
      res.send(payment);
    });

    //add doctor
    app.post("/doctor", verifyToken, verifyAdmin, async (req, res) => {
      const doctor = req.body;
      const result = await doctorCollection.insertOne(doctor);
      res.send(result);
    });

    //get manage doctor
    app.get("/doctors", verifyToken, verifyAdmin, async (req, res) => {
      const result = await doctorCollection.find().toArray();
      res.send(result);
    });

    //delete  doctor
    app.delete("/doctor/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const filter = { _id: ObjectId(id) };
      const result = await doctorCollection.deleteOne(filter);
      res.send(result);
    });

    //payment
    app.post("/create-payment-intent", verifyToken, async (req, res) => {
      const { price } = req.body;
      const amount = price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({ clientSecret: paymentIntent.client_secret });
    });
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("doctor portal server on");
});

app.listen(port, () => {
  console.log("listening port :", port);
});
