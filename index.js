const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');


const app = express();
const port = process.env.PORT || 5000

app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.aij94.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


async function run() {
    try {
        await client.connect();
        const appointmentsCollection = client.db("doctor_portal").collection("appointments");
        const bookingCollection = client.db("doctor_portal").collection("booking");

        //get appointments
        app.get('/appointments', async (req, res) => {
            const query = {}
            const cursor = appointmentsCollection.find(query);
            const appointments = await cursor.toArray();
            res.send(appointments);
        })

        //get available appointment
        app.get('/available', async (req, res) => {
            const date = req.query.date;
            // get all appointments data
            const appointments = await appointmentsCollection.find().toArray()
            //get all booking data
            const query = {date:date}
            const booking = await bookingCollection.find(query).toArray()

            appointments.forEach(appointment =>{
                //find booking for that appointments
                const appointmentBooking = booking.filter(book => book.bookingName === appointment.name)
                // select time for the appointment
                const bookingTime = appointmentBooking.map(book => book.time);
                // select those slots are not in booking time
                const available = appointment.slots.filter(slot => !bookingTime.includes(slot));
                 appointment.slots = available;
            })
            res.send(appointments);
        })

        //add booking service
        app.post('/booking', async (req, res) => {
            const booking = req.body;
            const query = { bookingName: booking.bookingName, patientName: booking.patientName, date: booking.date }
            const exists = await bookingCollection.findOne(query);
            if (exists) {
                return res.send({ success: false, booking: exists })
            }

            const result = await bookingCollection.insertOne(booking);
            res.send({ success: true, result })
        })

        //get booking
        app.get('/bookings', async (req, res) => {
            const query = {}
            const cursor = bookingCollection.find(query);
            const booking = await cursor.toArray();
            res.send(booking);
        })

    }
    finally {

    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('doctor portal server on');
})

app.listen(port, () => {
    console.log('listening port :', port);
})